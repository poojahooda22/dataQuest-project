"""Data Product (grouping) endpoints — the Fusion-style Catalog -> Data Product -> Dataset tree.

Read-only discovery over the worker-seeded `dataproduct` table. Each product carries a dataset count
and a roll-up commercial-display verdict — the contamination-safe AND over its datasets (a product is
GREEN only if EVERY dataset is), computed at READ time from the existing per-series `commercial_ok`, so
there is no stored derived state to go stale. Reads ONLY our store (read never fetches).
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.db import get_async_session
from app.core.errors import ProductNotFound
from app.models import DataProduct, Series

router = APIRouter(prefix="/products", tags=["products"])


class ProductOut(BaseModel):
    product_id: str
    title: str
    description: str
    theme: str
    sort_order: int
    dataset_count: int
    commercial_ok: bool  # roll-up: True only if EVERY dataset is commercial_ok (contamination AND)


class ProductDetail(ProductOut):
    datasets: list[Series]  # the series in this product


@router.get("", response_model=list[ProductOut], operation_id="list_data_products")
async def list_products(session: AsyncSession = Depends(get_async_session)) -> list[ProductOut]:
    """List Data Products with their dataset count + roll-up display verdict, ordered for the tree.

    ONE grouped query (no per-product N+1): LEFT JOIN series, COUNT + bool_and over the group. At
    catalog scale this stays a single indexed aggregate; cron-warm it before Tier 2 if products grow."""
    stmt = (
        select(
            DataProduct,
            func.count(Series.series_id).label("dataset_count"),
            func.bool_and(func.coalesce(Series.commercial_ok, False)).label("rollup_ok"),
        )
        .outerjoin(Series, Series.product_id == DataProduct.product_id)
        .group_by(DataProduct.product_id)
        .order_by(DataProduct.sort_order)
    )
    rows = (await session.execute(stmt)).all()
    return [
        ProductOut(
            product_id=p.product_id,
            title=p.title,
            description=p.description,
            theme=p.theme,
            sort_order=p.sort_order,
            dataset_count=count,
            commercial_ok=bool(rollup),  # bool_and is NULL for an empty product -> False
        )
        for p, count, rollup in rows
    ]


@router.get("/{product_id}", response_model=ProductDetail, operation_id="get_data_product")
async def get_product(
    product_id: str, session: AsyncSession = Depends(get_async_session)
) -> ProductDetail:
    """One Data Product + its datasets (the series in the group)."""
    product = await session.get(DataProduct, product_id)
    if product is None:
        raise ProductNotFound(product_id)
    datasets = (
        await session.execute(
            select(Series).where(Series.product_id == product_id).order_by(Series.series_id)
        )
    ).scalars().all()
    rollup = all(bool(s.commercial_ok) for s in datasets) if datasets else False
    return ProductDetail(
        product_id=product.product_id,
        title=product.title,
        description=product.description,
        theme=product.theme,
        sort_order=product.sort_order,
        dataset_count=len(datasets),
        commercial_ok=rollup,
        datasets=datasets,
    )