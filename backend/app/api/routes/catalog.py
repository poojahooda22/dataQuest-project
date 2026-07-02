"""Catalog (discovery) endpoints — list series, look one up, the reliability summary, and the changes feed (async)."""

from datetime import date, timedelta
from itertools import groupby

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from app.api.queries import CHANGES_SQL, REVISIONS_SQL
from app.api.revision_stats import compute_revision_stats
from app.core.db import get_async_session
from app.core.errors import CatalogNotFound
from app.models import Series

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("", response_model=list[Series])
async def list_series(
    session: AsyncSession = Depends(get_async_session),
    cid: str | None = None,
    source: str | None = None,
    frequency: str | None = None,
    product_id: str | None = None,
    q: str | None = Query(None, description="free-text match on series_id / xcat / description"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[Series]:
    """List catalog series, filtered SERVER-SIDE (cid / source / frequency / product / q). ALWAYS
    paginated. Each structured filter maps to an indexed column; `q` is an ILIKE scan — fine at this
    catalog size, add a pg_trgm GIN index before Tier 2."""
    stmt = select(Series)
    if cid:
        stmt = stmt.where(Series.cid == cid)
    if source:
        stmt = stmt.where(Series.source == source)
    if frequency:
        stmt = stmt.where(Series.frequency == frequency)
    if product_id:
        stmt = stmt.where(Series.product_id == product_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            col(Series.series_id).ilike(like)
            | col(Series.xcat).ilike(like)
            | col(Series.description).ilike(like)
        )
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.get("/reliability")
async def catalog_reliability(session: AsyncSession = Depends(get_async_session)) -> dict:
    """Compact per-series revision reliability for the discovery view — the bias verdict + typical
    revision for each REVISABLE (regime-A) series, computed once. Market series (regime B) are omitted
    (no revisions by construction → 'final' in the UI). The same `compute_revision_stats` the Insights
    card uses, summarized.

    R-SCALE: loops each revisable series' full vintage history sequentially (one async connection — never
    gather). Fine at ~16 series; cache / cron-warm before Tier-2 (1k+ series would melt this)."""
    revisable = (
        await session.execute(select(Series).where(col(Series.vintage_capable).is_(True)))
    ).scalars().all()
    out: dict[str, dict] = {}
    for s in revisable:
        rows = (
            await session.execute(
                REVISIONS_SQL,
                {"series_id": s.series_id, "start": date(1900, 1, 1), "end": date(9999, 12, 31), "row_cap": 50_001},
            )
        ).all()
        if not rows:
            out[s.series_id] = {"status": "unavailable"}
            continue
        observations = [
            (obs_date, [(r.vintage_date, r.value) for r in g])
            for obs_date, g in groupby(rows, key=lambda r: r.observation_date)
        ]
        strictly_positive = bool(observations) and all(v > 0 for _d, vv in observations for _vd, v in vv)
        stats = compute_revision_stats(
            observations,
            frequency=s.frequency or "M",
            commercial_ok=bool(s.commercial_ok),
            attribution=s.attribution or "",
            strictly_positive_level=strictly_positive,
        )
        if stats.get("status") == "unavailable" or "bias_test" not in stats:
            out[s.series_id] = {"status": "unavailable"}
            continue
        bt = stats["bias_test"]
        out[s.series_id] = {
            "status": "ok",
            "mar": stats.get("mar"),
            "mr": stats.get("mr"),
            "verdict": bt.get("verdict"),
            "significant": bt.get("significant"),
            "readout": stats.get("readout"),
        }
    return {"reliability": out}


class CatalogChange(BaseModel):
    series: Series
    latest_vintage: date  # the newest publication (vintage) date in the store
    new_observations: int  # information-states published after `since`


class CatalogChangesResponse(BaseModel):
    since: date
    changes: list[CatalogChange]


# NOTE: declared BEFORE /{ticker} so the literal path wins the route match.
@router.get("/changes", response_model=CatalogChangesResponse, operation_id="get_catalog_changes")
async def catalog_changes(
    since: date | None = None,
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_async_session),
) -> CatalogChangesResponse:
    """What the sources published recently — per series, the newest vintage date and how many new
    information-states arrived after `since` (default: the last 30 days). Read straight off the
    append-only vintage store: vintage_date IS the upstream publication event."""
    since = since or (date.today() - timedelta(days=30))
    rows = (await session.execute(CHANGES_SQL, {"since": since, "row_cap": limit})).all()
    ids = [r.series_id for r in rows]
    series_map = {
        s.series_id: s
        for s in (
            (await session.execute(select(Series).where(col(Series.series_id).in_(ids)))).scalars().all()
            if ids
            else []
        )
    }
    return CatalogChangesResponse(
        since=since,
        changes=[
            CatalogChange(
                series=series_map[r.series_id],
                latest_vintage=r.latest_vintage,
                new_observations=r.new_observations,
            )
            for r in rows
            if r.series_id in series_map
        ],
    )


@router.get("/{ticker}", response_model=Series)
async def get_series_meta(ticker: str, session: AsyncSession = Depends(get_async_session)) -> Series:
    """One series' catalog entry."""
    series = await session.get(Series, ticker)
    if series is None:
        raise CatalogNotFound(ticker)
    return series