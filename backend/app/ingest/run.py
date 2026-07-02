"""The worker entrypoint — run on a schedule, OFF the request path.

For each catalog series: fetch -> normalize -> load (the three TET steps + the loader).
Idempotent and append-only. A failed/empty/unauthorized fetch is caught and that series
is SKIPPED (ground-or-skip), never stored as a fabricated value.

Run locally with:  uv run python -m app.ingest.run
"""

from sqlmodel import Session

from app.core.db import engine
from app.ingest.errors import EmptyData, NeedsKey, Unavailable
from app.ingest.load import load_rows
from app.ingest.registry import DATA_PRODUCTS, FETCHERS, V1_SERIES


def upsert_catalog(session: Session) -> None:
    """Insert/update the catalog rows — the 'menu' of products + series the API can serve."""
    for product in DATA_PRODUCTS:  # products FIRST — series.product_id references them (FK)
        session.merge(product)
    for series in V1_SERIES:
        session.merge(series)  # insert if new, update if it already exists
    session.commit()


def run() -> None:
    # 1. make sure every series has a catalog row
    with Session(engine) as session:
        upsert_catalog(session)

    # 2. for each series: TET fetch -> normalize -> idempotent load
    for series in V1_SERIES:
        fetcher = FETCHERS[series.source]
        try:
            params = fetcher.transform_query(series.source_series_id)
            raw = fetcher.extract_data(params)
            rows, _provenance = fetcher.transform_data(raw)
        except (EmptyData, Unavailable, NeedsKey) as exc:
            print(f"{series.series_id}: SKIPPED ({type(exc).__name__}: {exc})")
            continue
        inserted = load_rows(series.series_id, rows)
        print(f"{series.series_id}: {inserted} new rows inserted (of {len(rows)} fetched)")


if __name__ == "__main__":
    run()