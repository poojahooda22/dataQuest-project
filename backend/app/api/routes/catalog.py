"""Catalog (discovery) endpoints — list available series and look one up (async)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

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


@router.get("/{ticker}", response_model=Series)
async def get_series_meta(ticker: str, session: AsyncSession = Depends(get_async_session)) -> Series:
    """One series' catalog entry."""
    series = await session.get(Series, ticker)
    if series is None:
        raise CatalogNotFound(ticker)
    return series