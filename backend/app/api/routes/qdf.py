"""QDF (Quantamental DataFrame) retrieval — the macrosynergy-LOADABLE channel.

Emits a single-valued long QDF (cid, xcat, real_date, value) — the shape the open `macrosynergy`
package consumes — projected at read time from our point-in-time store. real_date = the OBSERVATION
period (the economic time axis a macrosynergy user aligns/regresses on); value = the latest vintage
(mode=latest) or the value as known on `as_of` (mode=asof).

WHY real_date = observation_date (decision #5a): our store is an (observation_date x vintage_date)
PANEL, richer than a JPMaQS indicator (single-valued per real_date). A clean, usable QDF needs one
value per real_date; we key on the economic period and serve a single vintage. The FULL information-
state trail (every revision) is NOT flattened here — it lives on /api/v1/series/{ticker}/revisions.

Additive: the dashboard's own endpoints are untouched. Read-never-fetches (reads `observation` only).
"""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from app.api.queries import PIT_SQL_BULK
from app.core.db import get_async_session
from app.core.errors import InvalidRequest, ResultTooLarge
from app.models import Series

router = APIRouter(prefix="/qdf", tags=["qdf"])

# A multi-series QDF holds more than one chart; cap higher than /series' 50k but still bounded.
# Paginate by (ticker, date) before 100x catalog growth.
MAX_ROWS = 200_000
ALLOWED_METRICS = {"value"}  # grading/eop_lag/mop_lag are NOT emitted yet (no fabricated metadata)


class QdfRow(BaseModel):
    cid: str
    xcat: str
    real_date: date  # the observation period (economic axis) — see module docstring
    value: float


class QdfProvenance(BaseModel):
    ticker: str
    commercial_ok: bool
    attribution: str


class QdfResponse(BaseModel):
    as_of: date
    mode: str
    data: list[QdfRow]                # long format: load straight into a macrosynergy QDF
    provenance: list[QdfProvenance]   # per-ticker licence gate + attribution (carried, never dropped)


def _split(csv: str | None) -> list[str]:
    return [s.strip() for s in csv.split(",") if s.strip()] if csv else []


@router.get("", response_model=QdfResponse, operation_id="get_qdf")
async def get_qdf(
    tickers: str | None = Query(None, description="CSV of cid_xcat tickers, e.g. USD_CPI_SA,EUR_FXUSD_NSA"),
    cids: str | None = Query(None, description="CSV of cross-sections (alone = all xcats for those cids)"),
    xcats: str | None = Query(None, description="CSV of categories (alone = across all cids)"),
    mode: Literal["latest", "asof"] = "latest",
    as_of: date | None = None,
    start: date | None = None,
    end: date | None = None,
    metrics: str = Query("value", description="only 'value' is available today"),
    session: AsyncSession = Depends(get_async_session),
) -> QdfResponse:
    """Single-valued long QDF for the requested tickers (or `cids` and/or `xcats` — either alone)."""
    bad = (set(_split(metrics)) or {"value"}) - ALLOWED_METRICS
    if bad:
        raise InvalidRequest(f"metrics {sorted(bad)} not available yet; only 'value' is emitted.")

    want_tickers, want_cids, want_xcats = set(_split(tickers)), set(_split(cids)), set(_split(xcats))
    if not (want_tickers or want_cids or want_xcats):
        raise InvalidRequest("Provide `tickers`, or `cids` and/or `xcats`.")

    # Serve ONLY qdf_ticker-mapped series — never emit a non-grammar xcat like 'CPIAUCSL'.
    catalog = (
        await session.execute(select(Series).where(col(Series.qdf_ticker).is_not(None)))
    ).scalars().all()
    selected: list[Series] = []
    for s in catalog:
        ticker = s.qdf_ticker
        assert ticker is not None  # guaranteed by the WHERE above
        qdf_xcat = ticker[len(s.cid) + 1:]  # strip the KNOWN cid prefix (robust; cids never contain '_')
        if want_tickers:
            if ticker in want_tickers:
                selected.append(s)
        elif (not want_cids or s.cid in want_cids) and (not want_xcats or qdf_xcat in want_xcats):
            selected.append(s)
    if not selected:
        raise InvalidRequest("No QDF-mapped series matched the request.")

    by_id = {s.series_id: s for s in selected}
    pit_asof = date.today() if mode == "latest" else (as_of or date.today())
    rows = (
        await session.execute(
            PIT_SQL_BULK,
            {
                "series_ids": list(by_id.keys()),
                "as_of": pit_asof,
                "start": start or date(1900, 1, 1),
                "end": end or date(9999, 12, 31),
                "row_cap": MAX_ROWS + 1,
            },
        )
    ).all()
    if len(rows) > MAX_ROWS:
        raise ResultTooLarge(MAX_ROWS)

    data: list[QdfRow] = []
    for r in rows:
        s = by_id[r.series_id]
        qdf_xcat = s.qdf_ticker[len(s.cid) + 1:]  # type: ignore[index]  # qdf_ticker non-null here
        data.append(QdfRow(cid=s.cid, xcat=qdf_xcat, real_date=r.observation_date, value=r.value))

    provenance = [
        QdfProvenance(ticker=s.qdf_ticker, commercial_ok=s.commercial_ok, attribution=s.attribution)  # type: ignore[arg-type]
        for s in selected
    ]
    return QdfResponse(as_of=pit_asof, mode=mode, data=data, provenance=provenance)
