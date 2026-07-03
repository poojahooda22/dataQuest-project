"""Index engine verification — prove the construction math against HAND-COMPUTED examples.

The falsifiability test for BUILD 2: the engine must reproduce, for tiny universes small enough to
work out by hand, the exact weights each capping scheme yields — and the screens must include/exclude
the right constituents for the right reason. Pure logic, no DB or network.

Run: backend/.venv/Scripts/python.exe backend/scripts/verify_index_engine.py
"""

from app.ingest.errors import EmptyData
from app.ingest.index_engine import Candidate, IndexRules, build_composition

TOL = 1e-9


def _rules(cap_scheme="none", cap_pct=None, income_ceiling=None, min_face=0.0, min_maturity=0.0):
    return IndexRules(
        income_ceiling_usd=income_ceiling,
        min_face_usd_mn=min_face,
        min_maturity_years=min_maturity,
        exit_maturity_months=6.0,
        cap_scheme=cap_scheme,
        cap_pct=cap_pct,
    )


def _bond(cid_id, face, maturity=None, income=()):
    return Candidate(constituent_id=cid_id, name=cid_id, cid=cid_id, face_amount=face,
                     years_to_maturity=maturity, income_history=income)


def _weights(rows):
    return {r.constituent_id: r.capped_weight for r in rows if r.eligible}


def main() -> int:
    print("=" * 70)
    print("BUILD 2 — index engine verification (hand-computed worked examples).")
    print("=" * 70)

    # 1. FACE WEIGHTING, no cap — face 100/300/600 -> weights 0.1/0.3/0.6.
    rows = build_composition([_bond("A", 100), _bond("B", 300), _bond("C", 600)], _rules("none"))
    w = _weights(rows)
    assert abs(w["A"] - 0.1) < TOL and abs(w["B"] - 0.3) < TOL and abs(w["C"] - 0.6) < TOL, w
    assert all(abs(r.raw_weight - r.capped_weight) < TOL for r in rows), "no-cap must leave weights unchanged"
    print(f"OK  [1/7] face weighting — A/B/C = {w['A']:.3f}/{w['B']:.3f}/{w['C']:.3f} (expected .100/.300/.600)")

    # 2. PCT CAP @ 40% — raw .1/.3/.6, iterative cap -> A .20, B .40, C .40 (worked out by hand).
    rows = build_composition([_bond("A", 100), _bond("B", 300), _bond("C", 600)], _rules("pct", cap_pct=0.40))
    w = _weights(rows)
    assert abs(w["A"] - 0.20) < TOL and abs(w["B"] - 0.40) < TOL and abs(w["C"] - 0.40) < TOL, w
    assert abs(sum(w.values()) - 1.0) < TOL, "capped weights must still sum to 1"
    print(f"OK  [2/7] pct cap @40% — A/B/C = {w['A']:.3f}/{w['B']:.3f}/{w['C']:.3f} (expected .200/.400/.400)")

    # 3. ICA CAP — face 100/100/100/1000 -> ICA=325, ceiling=650; capped face 100/100/100/650 over 950.
    rows = build_composition(
        [_bond("A", 100), _bond("B", 100), _bond("C", 100), _bond("BIG", 1000)], _rules("ica")
    )
    w = _weights(rows)
    assert abs(w["A"] - 100 / 950) < TOL and abs(w["BIG"] - 650 / 950) < TOL, w
    assert abs(sum(w.values()) - 1.0) < TOL, "ICA weights must sum to 1"
    assert w["BIG"] < 1000 / 1300, "the cap must pull the largest issuer BELOW its raw weight"
    print(f"OK  [3/7] ICA cap — BIG capped {1000/1300:.3f} -> {w['BIG']:.3f}, small {w['A']:.3f} (expected .684 / .105)")

    # 4. INCOME SCREEN — X below ceiling 3 consecutive yrs = eligible; Y only 2 = excluded.
    rows = build_composition(
        [_bond("X", 500, income=(30000, 20000, 20000, 20000)),   # last 3 below 23287 -> eligible
         _bond("Y", 500, income=(20000, 25000, 20000, 20000))],  # 25000 breaks the streak -> only 2 consecutive
        _rules("none", income_ceiling=23287.0),
    )
    by = {r.constituent_id: r for r in rows}
    assert by["X"].eligible, by["X"].eligibility_reason
    assert not by["Y"].eligible, "Y has only 2 consecutive years below the ceiling"
    print(f"OK  [4/7] income screen — X eligible; Y excluded ('{by['Y'].eligibility_reason}')")

    # 5. MATURITY SCREEN — >=2.5y required; a 1.0y bond is excluded, a 5y bond included.
    rows = build_composition(
        [_bond("SHORT", 500, maturity=1.0), _bond("LONG", 500, maturity=5.0)],
        _rules("none", min_maturity=2.5),
    )
    by = {r.constituent_id: r for r in rows}
    assert not by["SHORT"].eligible and by["LONG"].eligible, "maturity screen wrong"
    print(f"OK  [5/7] maturity screen — SHORT excluded ('{by['SHORT'].eligibility_reason}'), LONG in")

    # 6. INFEASIBLE PCT CAP — cap 0.2 with 3 constituents (0.2*3=0.6 < 1) must raise, never silently renormalize.
    try:
        build_composition([_bond("A", 1), _bond("B", 1), _bond("C", 1)], _rules("pct", cap_pct=0.2))
        raise AssertionError("expected ValueError for an infeasible cap")
    except ValueError as e:
        print(f"OK  [6/7] infeasible cap raises — {e}")

    # 7. EMPTY INPUT — no candidates must raise EmptyData (never fabricate an empty index silently).
    try:
        build_composition([], _rules("none"))
        raise AssertionError("expected EmptyData for no candidates")
    except EmptyData:
        print("OK  [7/7] empty input raises EmptyData (ground-or-skip, never fabricate)")

    print("\nBUILD 2 PASS — screens, face weighting, pct cap, and ICA cap all match hand computation.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
