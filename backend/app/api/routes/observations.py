"""Bulk point-in-time endpoint — combined QDF rows for several tickers in ONE query.

The macrosynergy download(tickers) analogue, done the way the incumbent does it: a single
batched query (WHERE series_id = ANY(...)), not a per-ticker loop. Bounded by a date window
(start/end) and a hard row cap so a call can never pull the whole panel.
"""

from datetime import date
from itertools import groupby

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.downsample import downsample_rows
from app.api.queries import PIT_SQL_BULK
from app.core.db import get_async_session
from app.core.errors import InvalidRequest, ResultTooLarge

router = APIRouter(prefix="/observations", tags=["observations"])

MAX_TICKERS = 50
MAX_ROWS = 50_000  # hard ceiling per request; beyond this, narrow start/end


class QdfRecord(BaseModel):
    """One long-format QDF row (carries the ticker)."""

    series_id: str
    observation_date: date
    vintage_date: date
    value: float


@router.get("", response_model=list[QdfRecord])
async def get_observations(
    tickers: list[str] = Query(..., description="one or more series tickers"),
    as_of: date | None = None,
    start: date | None = None,
    end: date | None = None,
    max_points: int | None = Query(
        None, ge=10, le=MAX_ROWS,
        description="downsample EACH series (LTTB, shape-preserving) to ~this many points",
    ),
    session: AsyncSession = Depends(get_async_session),
) -> list[QdfRecord]:
    """Combined point-in-time QDF for several tickers, as known on as_of (default today)."""
    # (a missing `tickers` is a required-param 422 from FastAPI before we get here)
    if len(tickers) > MAX_TICKERS:
        raise InvalidRequest(f"at most {MAX_TICKERS} tickers per request")
    params = {
        "series_ids": tickers,
        "as_of": as_of or date.today(),
        "start": start or date(1900, 1, 1),
        "end": end or date(9999, 12, 31),
        "row_cap": MAX_ROWS + 1,  # fetch one extra so we can detect "too big"
    }
    result = await session.execute(PIT_SQL_BULK, params)  # ONE round-trip for all tickers
    rows = result.all()
    if len(rows) > MAX_ROWS:
        raise ResultTooLarge(MAX_ROWS)
    if max_points:
        # LTTB PER SERIES — the bulk result is ordered by (series_id, observation_date), so each
        # group is one series' contiguous, date-ordered points. Never LTTB across series.
        reduced: list = []
        for _series_id, group in groupby(rows, key=lambda r: r.series_id):
            reduced.extend(downsample_rows(list(group), max_points))
        rows = reduced
    return [
        QdfRecord(
            series_id=r.series_id,
            observation_date=r.observation_date,
            vintage_date=r.vintage_date,
            value=r.value,
        )
        for r in rows
    ]