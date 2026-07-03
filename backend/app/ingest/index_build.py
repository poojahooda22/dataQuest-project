"""The index write-path — fetch constituents, run the engine, load compositions. Off the request path.

For each seeded IndexDefinition that has a constituent source wired:
    fetch candidates -> build_composition (the pure engine) -> load append-only into indexcomposition.

Mirrors the series worker (run.py + load.py): idempotent (ON CONFLICT DO NOTHING on the vintage key),
append-only, and ground-or-skip on a failed/empty fetch (never a fabricated composition). The engine
stays pure; this module is the only place that touches the network and the database for indices.

Run:  uv run python -m app.ingest.index_build
"""

from datetime import date

from sqlalchemy import text
from sqlmodel import Session

from app.core.db import engine
from app.ingest.errors import EmptyData, NeedsKey, Unavailable
from app.ingest.index_engine import CompositionRow, IndexRules, build_composition
from app.ingest.registry import INDEX_DEFINITIONS
from app.ingest.sources.fiscaldata import MspdTreasurySource
from app.ingest.sources.worldbank import WorldBankEmSource
from app.models import IndexDefinition

# Which constituent source feeds which index. An index with no entry here is skipped (not yet wired).
INDEX_SOURCES = {
    "us-treasury": MspdTreasurySource(),
    "em-composition": WorldBankEmSource(),
}

_INSERT = text(
    """
    INSERT INTO indexcomposition
        (index_id, rebalance_date, vintage_date, constituent_id, constituent_name, cid,
         face_amount, raw_weight, capped_weight, eligible, eligibility_reason)
    VALUES
        (:index_id, :rebalance_date, :vintage_date, :constituent_id, :constituent_name, :cid,
         :face_amount, :raw_weight, :capped_weight, :eligible, :eligibility_reason)
    ON CONFLICT (index_id, rebalance_date, vintage_date, constituent_id) DO NOTHING
    """
)


def rules_from_definition(defn: IndexDefinition) -> IndexRules:
    """Project a stored IndexDefinition onto the engine's pure IndexRules (keeps the engine DB-free)."""
    return IndexRules(
        income_ceiling_usd=defn.income_ceiling_usd,
        min_face_usd_mn=defn.min_face_usd_mn,
        min_maturity_years=defn.min_maturity_years,
        exit_maturity_months=defn.exit_maturity_months,
        cap_scheme=defn.cap_scheme,
        cap_pct=defn.cap_pct,
    )


def load_composition(
    index_id: str, rebalance_date: date, vintage_date: date, rows: list[CompositionRow]
) -> int:
    """Append one composition (all constituents) as a new vintage; returns rows ACTUALLY inserted."""
    inserted = 0
    with Session(engine) as session:
        for row in rows:
            result = session.execute(
                _INSERT,
                {
                    "index_id": index_id,
                    "rebalance_date": rebalance_date,
                    "vintage_date": vintage_date,
                    "constituent_id": row.constituent_id,
                    "constituent_name": row.constituent_name,
                    "cid": row.cid,
                    "face_amount": row.face_amount,
                    "raw_weight": row.raw_weight,
                    "capped_weight": row.capped_weight,
                    "eligible": row.eligible,
                    "eligibility_reason": row.eligibility_reason,
                },
            )
            inserted += result.rowcount
        session.commit()
    return inserted


def build_indices(as_of: date | None = None) -> None:
    """Build every wired index as known on `as_of` (default today) and load it as a vintage."""
    as_of = as_of or date.today()
    for defn in INDEX_DEFINITIONS:
        source = INDEX_SOURCES.get(defn.index_id)
        if source is None:
            print(f"{defn.index_id}: no constituent source wired yet — skipped")
            continue
        try:
            rebalance_date, candidates = source.fetch_candidates(as_of)
            rows = build_composition(candidates, rules_from_definition(defn))
        except (EmptyData, Unavailable, NeedsKey) as exc:
            print(f"{defn.index_id}: SKIPPED ({type(exc).__name__}: {exc})")
            continue
        inserted = load_composition(defn.index_id, rebalance_date, as_of, rows)
        eligible = sum(1 for r in rows if r.eligible)
        print(
            f"{defn.index_id}: rebalance {rebalance_date}, {eligible}/{len(rows)} eligible, "
            f"{inserted} rows inserted (vintage {as_of})"
        )


if __name__ == "__main__":
    build_indices()
