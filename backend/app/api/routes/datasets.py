"""Dataset-scoped endpoints — the data DICTIONARY (attributes) for one dataset.

The attributes table is the per-field schema a catalog shows for a dataset: one row per column with its
identifier, human title, data type, whether it is part of the dataset key, a description, and its source.
Ours is synthesized HONESTLY from the observation shape we actually serve (a point-in-time macro series is
`observation_date x vintage_date -> value`) — these ARE the real fields of the PIT payload, not an invented
schema. The vintage key doubles as the place the point-in-time design is explained to a user.
"""

import csv
import io
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.queries import PIT_SQL
from app.core.db import get_async_session
from app.core.errors import CatalogNotFound, DownloadNotLicensed, ResultTooLarge, SeriesDataNotFound
from app.models import Series

router = APIRouter(prefix="/datasets", tags=["datasets"])

_DOWNLOAD_MAX_ROWS = 50_000  # same bound as the JSON read path — one series stays well inside it


class DatasetAttribute(BaseModel):
    identifier: str
    title: str
    dataType: str
    isDatasetKey: bool
    description: str
    source: str


class DatasetAttributesResponse(BaseModel):
    ticker: str
    commercial_ok: bool
    attribution: str
    attributes: list[DatasetAttribute]


@router.get(
    "/{ticker}/attributes",
    response_model=DatasetAttributesResponse,
    operation_id="get_dataset_attributes",
)
async def get_dataset_attributes(
    ticker: str, session: AsyncSession = Depends(get_async_session)
) -> DatasetAttributesResponse:
    """The data dictionary for one dataset — the fields of its point-in-time observation record."""
    series = await session.get(Series, ticker)
    if series is None:
        raise CatalogNotFound(ticker)

    vintage_desc = (
        "When this value was first published (the information-state date). Together with the observation "
        "date it forms the point-in-time key: query `as_of` any past date to see the series as it was "
        "known then."
        if series.vintage_capable
        else "Equal to the observation date for this series: a market observable is never revised, so "
        "the first print is final."
    )
    attributes = [
        DatasetAttribute(
            identifier="observation_date",
            title="Observation date",
            dataType="Date",
            isDatasetKey=True,
            description="The period the value describes (first day of the period).",
            source=series.source,
        ),
        DatasetAttribute(
            identifier="vintage_date",
            title="Vintage date",
            dataType="Date",
            isDatasetKey=True,
            description=vintage_desc,
            source=series.source,
        ),
        DatasetAttribute(
            identifier="value",
            title=series.description or "Observed value",
            dataType="Double",
            isDatasetKey=False,
            description=(
                f"The observed level of {series.description or series.xcat}. "
                + (f"Unit: {series.unit}. " if series.unit else "")
                + f"Frequency: {series.frequency}. As published by the source at the given vintage."
            ),
            source=series.source,
        ),
    ]
    return DatasetAttributesResponse(
        ticker=ticker,
        commercial_ok=bool(series.commercial_ok),
        attribution=series.attribution or "",
        attributes=attributes,
    )


@router.get("/{ticker}/download.csv", operation_id="download_dataset_csv")
async def download_dataset_csv(
    ticker: str, session: AsyncSession = Depends(get_async_session)
) -> PlainTextResponse:
    """The dataset as a CSV file — ONLY for series whose fetch path is licensed for redistribution.

    The gate is enforced server-side: `Series.downloadable` is true only where the sources-ledger records
    an explicit reuse grant (e.g. the ECB reuse policy); everything else gets a typed 403, never a file.
    Attribution + licence travel INSIDE the file bytes (comment header), so a shared file keeps its
    provenance. One bounded series served synchronously off the PIT read — the same cost class as the
    JSON endpoint (this is not the bulk-export pipeline; that remains out of scope per the licence audit).
    """
    series = await session.get(Series, ticker)
    if series is None:
        raise CatalogNotFound(ticker)
    if not series.downloadable:
        raise DownloadNotLicensed(ticker)

    result = await session.execute(
        PIT_SQL,
        {
            "series_id": ticker,
            "as_of": date.today(),
            "start": date(1900, 1, 1),
            "end": date(9999, 12, 31),
            "row_cap": _DOWNLOAD_MAX_ROWS + 1,
        },
    )
    rows = result.all()
    if not rows:
        raise SeriesDataNotFound(ticker, date.today())
    if len(rows) > _DOWNLOAD_MAX_ROWS:
        raise ResultTooLarge(_DOWNLOAD_MAX_ROWS)

    buf = io.StringIO()
    buf.write(f"# {series.description or ticker}\n")
    buf.write(f"# {series.attribution}\n")
    buf.write(f"# ticker: {ticker} | frequency: {series.frequency} | as_of: {date.today().isoformat()}\n")
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["observation_date", "value", "vintage_date"])
    for r in rows:
        writer.writerow([r.observation_date.isoformat(), r.value, r.vintage_date.isoformat()])

    return PlainTextResponse(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{ticker}.csv"'},
    )
