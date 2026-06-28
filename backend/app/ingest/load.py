"""The loader — write normalized rows into Postgres, append-only and idempotent.

Idempotent = running it again changes nothing. The UNIQUE(series_id, observation_date,
vintage_date) constraint we built in Phase 1 makes "ON CONFLICT DO NOTHING" silently
skip any row that already exists, so the worker can run every day forever and only
genuinely-new vintages get added. We never overwrite history (append-only).
"""

from sqlalchemy import text
from sqlmodel import Session

from app.core.db import engine
from app.ingest.standard import QdfRow

# Raw SQL (one of the two hot spots that earn hand-written SQL). :name are bound
# parameters — values are sent separately from the SQL text, so user/source data can
# never be injected into the statement.
_INSERT = text(
    """
    INSERT INTO observation (series_id, observation_date, vintage_date, value)
    VALUES (:series_id, :observation_date, :vintage_date, :value)
    ON CONFLICT (series_id, observation_date, vintage_date) DO NOTHING
    """
)


def load_rows(series_id: str, rows: list[QdfRow]) -> int:
    """Insert rows for one series, skipping any that already exist.

    Returns the number ACTUALLY inserted (not merely attempted), so a second run
    reports 0 — the proof that ingest is idempotent.
    """
    inserted = 0
    with Session(engine) as session:
        for row in rows:
            result = session.execute(
                _INSERT,
                {
                    "series_id": series_id,
                    "observation_date": row.observation_date,
                    "vintage_date": row.vintage_date,
                    "value": row.value,
                },
            )
            inserted += result.rowcount  # 1 if inserted, 0 if it already existed
        session.commit()
    return inserted