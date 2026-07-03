"""The index engine — the pure re-engineering of published bond-index construction rules.

Given a list of CANDIDATE constituents (bonds or countries) and an index's RULES, it runs the
four published steps and returns in-memory composition rows:

    screen   -> which candidates qualify (face / maturity / income screens), with a reason each
    weight   -> face-amount-proportional raw weights over the eligible set
    cap      -> a diversification cap (none | pct | ica) with proportional redistribution
    assemble -> one CompositionRow per candidate (eligible with weights; ineligible with 0 + why)

This module is PURE: no database, no network, no ORM. It mirrors the write-path's `transform_data`
step — it produces rows IN MEMORY (like `QdfRow`); the worker/loader attaches index_id, rebalance_date
and vintage_date and writes them as `IndexComposition` rows. Being pure is what makes the capping math
unit-testable against a hand-computed example (see backend/scripts/verify_index_engine.py).

Honesty note: these are OUR renderings of EMBI-class rules over OUR data — not a bit-exact reproduction
of any proprietary index. Where a published nuance is simplified, the docstring says so.
"""

from dataclasses import dataclass

from app.ingest.errors import EmptyData

# Methodology constants (verified EMBI-class values; kept as named constants, not magic numbers).
_CONSECUTIVE_INCOME_YEARS = 3   # a country must be below the income ceiling for 3 consecutive years
_ICA_CAP_MULTIPLE = 2.0         # the average-based cap: counted face is limited to 2x the country average
_EPS = 1e-12


@dataclass(frozen=True)
class Candidate:
    """One thing that MIGHT enter an index — a bond (keyed by CUSIP) or a country. Engine input.

    `income_history` is only used by the income screen (EM): the country's GNI-per-capita values,
    OLDEST -> NEWEST. `years_to_maturity` is only used by the maturity screen (bonds). A field left at
    its default simply means "that screen does not apply to me".
    """

    constituent_id: str
    name: str
    cid: str
    face_amount: float                      # USD millions — the weight numerator
    years_to_maturity: float | None = None  # for the maturity screen; None = no maturity data
    income_history: tuple[float, ...] = ()   # GNI/capita oldest->newest; for the income screen


@dataclass(frozen=True)
class IndexRules:
    """The construction rules the engine applies — the pure form of an `IndexDefinition` row.

    Kept separate from the ORM model so the engine stays database-free and testable. The worker
    builds one of these from a seeded `IndexDefinition` before calling `build_composition`.
    """

    income_ceiling_usd: float | None    # GNI/capita eligibility ceiling; None = no income screen
    min_face_usd_mn: float              # minimum face outstanding to qualify (USD millions)
    min_maturity_years: float          # minimum years to maturity at entry; 0 = no maturity screen
    exit_maturity_months: float        # documented exit floor (see build_composition note)
    cap_scheme: str                    # "none" | "pct" | "ica"
    cap_pct: float | None              # the cap for the "pct" scheme, e.g. 0.09 = 9%


@dataclass(frozen=True)
class CompositionRow:
    """One constituent's engine result, IN MEMORY, before load. Mirrors `QdfRow`'s role.

    Carries no index_id / rebalance_date / vintage_date — those belong to the database row
    (`IndexComposition`) and are attached at load time, exactly like `QdfRow` -> `Observation`.
    """

    constituent_id: str
    constituent_name: str
    cid: str
    face_amount: float
    raw_weight: float       # face / total eligible face, BEFORE the cap (0..1); 0 for ineligible
    capped_weight: float    # weight AFTER the cap + redistribution (0..1); 0 for ineligible
    eligible: bool
    eligibility_reason: str


def _consecutive_years_below(history: tuple[float, ...], ceiling: float) -> int:
    """Count trailing consecutive years (from the newest backward) with value < ceiling."""
    count = 0
    for value in reversed(history):
        if value < ceiling:
            count += 1
        else:
            break
    return count


def _screen(candidate: Candidate, rules: IndexRules) -> tuple[bool, str]:
    """Apply the eligibility screens in order; return (eligible, human reason)."""
    if candidate.face_amount < rules.min_face_usd_mn:
        return False, f"face {candidate.face_amount:.0f}mn < {rules.min_face_usd_mn:.0f}mn minimum"

    if rules.min_maturity_years > 0:
        if candidate.years_to_maturity is None:
            return False, "no maturity data for the maturity screen"
        if candidate.years_to_maturity < rules.min_maturity_years:
            return (
                False,
                f"maturity {candidate.years_to_maturity:.1f}y < {rules.min_maturity_years:.1f}y minimum",
            )

    if rules.income_ceiling_usd is not None:
        years = _consecutive_years_below(candidate.income_history, rules.income_ceiling_usd)
        if years < _CONSECUTIVE_INCOME_YEARS:
            return (
                False,
                f"GNI/capita below ceiling only {years}/{_CONSECUTIVE_INCOME_YEARS} consecutive years",
            )

    return True, "eligible"


def _cap_iterative_pct(weights: dict[str, float], cap: float) -> dict[str, float]:
    """Cap every weight at `cap`, redistributing the excess PROPORTIONALLY among the uncapped.

    The standard iterative capping algorithm (as used by capped market-cap indices): pin the
    over-cap weights to `cap`, spread their combined excess across those still below `cap` in
    proportion to their current weight, and repeat until nothing exceeds the cap. Converges in at
    most n passes. Raises if the cap is infeasible (cap * n < 1 -> the weights cannot all fit under
    it) — a fail-loud boundary check, never a silent renormalization.
    """
    n = len(weights)
    if n == 0:
        return {}
    if cap * n < 1.0 - _EPS:
        raise ValueError(f"cap {cap} infeasible for {n} constituents (cap*n={cap * n:.3f} < 1)")

    w = dict(weights)
    for _ in range(n + 1):
        over = [k for k, v in w.items() if v > cap + _EPS]
        if not over:
            break
        excess = sum(w[k] - cap for k in over)
        for k in over:
            w[k] = cap
        under = [k for k in w if w[k] < cap - _EPS]
        pool = sum(w[k] for k in under)
        if pool <= _EPS:
            break
        for k in under:
            w[k] += excess * (w[k] / pool)
    return w


def _cap_ica(face: dict[str, float]) -> dict[str, float]:
    """The average-based diversification cap: counted face is limited to 2x the country average.

    ICA (Index Country Average) = total face / number of constituents. Each constituent's COUNTED
    face is capped at 2x ICA; weights are recomputed from the capped face (which redistributes weight
    away from the largest issuers). This is our rendering of the "Diversified" average-based cap; the
    published methodology additionally SMOOTHS with a linear interpolation between ICA and 2x ICA,
    which we render here as a hard cap (a documented simplification, not a claim of exact parity).
    """
    n = len(face)
    if n == 0:
        return {}
    total = sum(face.values())
    if total <= 0:
        return {k: 0.0 for k in face}
    ceiling = _ICA_CAP_MULTIPLE * (total / n)
    capped_face = {k: min(v, ceiling) for k, v in face.items()}
    capped_total = sum(capped_face.values())
    return {k: v / capped_total for k, v in capped_face.items()}


def build_composition(candidates: list[Candidate], rules: IndexRules) -> list[CompositionRow]:
    """Run screen -> weight -> cap -> assemble and return one CompositionRow per candidate.

    Raises `EmptyData` when there is nothing to build from (no candidates, or eligible face sums to
    zero) — the write-path's never-fabricate signal, which the worker turns into ground-or-skip.
    """
    if not candidates:
        raise EmptyData("no candidates to build a composition from")
    for c in candidates:
        if c.face_amount < 0:
            raise ValueError(f"{c.constituent_id}: negative face_amount {c.face_amount}")

    screened = [(c, *_screen(c, rules)) for c in candidates]      # (candidate, eligible, reason)
    eligible = [c for (c, ok, _) in screened if ok]

    total_face = sum(c.face_amount for c in eligible)
    if eligible and total_face <= 0:
        raise EmptyData("eligible constituents have zero total face — cannot weight")

    raw = {c.constituent_id: c.face_amount / total_face for c in eligible} if total_face > 0 else {}

    if not eligible:
        capped: dict[str, float] = {}
    elif rules.cap_scheme == "none":
        capped = dict(raw)
    elif rules.cap_scheme == "pct":
        if rules.cap_pct is None:
            raise ValueError("cap_scheme 'pct' requires cap_pct")
        capped = _cap_iterative_pct(raw, rules.cap_pct)
    elif rules.cap_scheme == "ica":
        capped = _cap_ica({c.constituent_id: c.face_amount for c in eligible})
    else:
        raise ValueError(f"unknown cap_scheme {rules.cap_scheme!r}")

    return [
        CompositionRow(
            constituent_id=c.constituent_id,
            constituent_name=c.name,
            cid=c.cid,
            face_amount=c.face_amount,
            raw_weight=raw.get(c.constituent_id, 0.0),
            capped_weight=capped.get(c.constituent_id, 0.0),
            eligible=ok,
            eligibility_reason=reason,
        )
        for (c, ok, reason) in screened
    ]
