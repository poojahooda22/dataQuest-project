"""Catalog (discovery) endpoints — list available series, look one up, and the per-series reliability summary (async)."""

from datetime import date
from itertools import groupby

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from app.api.queries import REVISIONS_SQL
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
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[Series]:
    """List catalog series, optionally filtered by cid or source. ALWAYS paginated."""
    stmt = select(Series)
    if cid:
        stmt = stmt.where(Series.cid == cid)
    if source:
        stmt = stmt.where(Series.source == source)
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


@router.get("/{ticker}", response_model=Series)
async def get_series_meta(ticker: str, session: AsyncSession = Depends(get_async_session)) -> Series:
    """One series' catalog entry."""
    series = await session.get(Series, ticker)
    if series is None:
        raise CatalogNotFound(ticker)
    return series