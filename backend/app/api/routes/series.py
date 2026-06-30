"""The point-in-time series endpoint — the core of the product (now async).

GET /api/v1/series/{ticker}?as_of=YYYY-MM-DD returns the series AS KNOWN ON that date,
optionally bounded by start/end. Reads ONLY our store (read never fetches).
"""

from datetime import date
from itertools import groupby

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.downsample import downsample_rows, lttb_indices
from app.api.queries import PIT_SQL, REVISIONS_SQL
from app.api.revision_stats import compute_revision_stats
from app.core.db import get_async_session
from app.core.errors import CatalogNotFound, InvalidRequest, ResultTooLarge, SeriesDataNotFound

router = APIRouter(prefix="/series", tags=["series"])

MAX_ROWS = 50_000


class ObservationOut(BaseModel):
    observation_date: date
    value: float
    vintage_date: date  # which vintage answered, given as_of


class SeriesResponse(BaseModel):
    ticker: str
    as_of: date
    commercial_ok: bool
    attribution: str
    downsampled: bool  # true if LTTB reduced the series to <= max_points (chart-shaped, lossy)
    observations: list[ObservationOut]


@router.get("/{ticker}", response_model=SeriesResponse, operation_id="get_series_point_in_time")
async def get_series(
    ticker: str,
    as_of: date | None = None,
    start: date | None = None,
    end: date | None = None,
    max_points: int | None = Query(
        None, ge=10, le=MAX_ROWS,
        description="downsample (LTTB, shape-preserving) to ~this many points for a chart",
    ),
    session: AsyncSession = Depends(get_async_session),
) -> SeriesResponse:
    """Return `ticker` as it was known on `as_of` (defaults to today)."""
    as_of = as_of or date.today()
    result = await session.execute(
        PIT_SQL,
        {
            "series_id": ticker,
            "as_of": as_of,
            "start": start or date(1900, 1, 1),
            "end": end or date(9999, 12, 31),
            "row_cap": MAX_ROWS + 1,
        },
    )
    rows = result.all()
    if not rows:
        raise SeriesDataNotFound(ticker, as_of)
    if len(rows) > MAX_ROWS:
        raise ResultTooLarge(MAX_ROWS)
    downsampled = bool(max_points and len(rows) > max_points)
    if downsampled:
        rows = downsample_rows(rows, max_points)
    meta_result = await session.execute(
        text("SELECT commercial_ok, attribution FROM series WHERE series_id = :s"),
        {"s": ticker},
    )
    meta = meta_result.first()
    return SeriesResponse(
        ticker=ticker,
        as_of=as_of,
        commercial_ok=bool(meta.commercial_ok) if meta else False,
        attribution=meta.attribution if meta else "",
        downsampled=downsampled,
        observations=[
            ObservationOut(observation_date=r.observation_date, value=r.value, vintage_date=r.vintage_date)
            for r in rows
        ],
    )


# ── Vintage comparison (diff-two-vintages) — the Insights keystone ──────────────────────
# Compare a vintage-capable series as known on TWO information-states (vintage_a vs vintage_b),
# aligned by observation_date, with the revision (value_b - value_a) computed server-side. Reuses
# the SAME verified PIT_SQL (run once per vintage) so it can never drift from /series. Regime-A
# (revisable) series only: a market series (regime B) is never revised, so the diff is meaningless.


class PanelPoint(BaseModel):
    observation_date: date
    value_a: float | None  # as known on vintage_a (None = period not yet known then)
    value_b: float | None  # as known on vintage_b
    revision: float | None  # value_b - value_a (None if either side is missing)
    revision_pct: float | None  # revision / value_a * 100 (None if value_a is missing or 0)


class PanelSummary(BaseModel):
    n_compared: int  # observations where BOTH vintages have a value
    n_revised: int  # of those, where value_b != value_a
    mean_revision: float | None  # signed average revision (the revision bias)
    mean_abs_revision: float | None
    max_abs_revision: float | None


class PanelResponse(BaseModel):
    ticker: str
    vintage_a: date
    vintage_b: date
    commercial_ok: bool
    attribution: str
    downsampled: bool  # true if LTTB reduced `points`; `summary` is always computed on the full set
    summary: PanelSummary
    points: list[PanelPoint]


def _downsample_points(points: list[PanelPoint], max_points: int) -> list[PanelPoint]:
    """LTTB over the aligned panel, driven by value_b (fallback value_a). Every point carries at
    least one value (it came from the UNION of the two vintages), so the y is always defined."""
    if max_points >= len(points) or len(points) < 3:
        return points
    xs = [p.observation_date.toordinal() for p in points]
    ys = [float(p.value_b if p.value_b is not None else p.value_a) for p in points]
    return [points[i] for i in lttb_indices(xs, ys, max_points)]


@router.get("/{ticker}/panel", response_model=PanelResponse, operation_id="get_series_vintage_panel")
async def get_series_panel(
    ticker: str,
    vintage_a: date,
    vintage_b: date | None = None,
    start: date | None = None,
    end: date | None = None,
    max_points: int | None = Query(
        None, ge=10, le=MAX_ROWS,
        description="downsample `points` (LTTB, shape-preserving) to ~this many for a chart",
    ),
    session: AsyncSession = Depends(get_async_session),
) -> PanelResponse:
    """Compare `ticker` as known on `vintage_a` vs `vintage_b` (default today), aligned by
    observation_date with the revision computed server-side."""
    vintage_b = vintage_b or date.today()
    if vintage_a > vintage_b:
        raise InvalidRequest("vintage_a must be on or before vintage_b.")

    meta = (
        await session.execute(
            text("SELECT commercial_ok, attribution, vintage_capable FROM series WHERE series_id = :s"),
            {"s": ticker},
        )
    ).first()
    if meta is None:
        raise CatalogNotFound(ticker)
    if not meta.vintage_capable:
        raise InvalidRequest(
            f"'{ticker}' is not vintage-capable; the two-vintage diff needs a revisable (regime A) series."
        )

    win_start = start or date(1900, 1, 1)
    win_end = end or date(9999, 12, 31)

    async def _pit(as_of: date) -> dict[date, float]:
        result = await session.execute(
            PIT_SQL,
            {"series_id": ticker, "as_of": as_of, "start": win_start, "end": win_end, "row_cap": MAX_ROWS + 1},
        )
        rows = result.all()
        if len(rows) > MAX_ROWS:
            raise ResultTooLarge(MAX_ROWS)
        return {r.observation_date: r.value for r in rows}

    # Two sequential index scans (the async session is ONE connection — never gather these).
    map_a = await _pit(vintage_a)
    map_b = await _pit(vintage_b)
    if not map_a and not map_b:
        raise SeriesDataNotFound(ticker, f"{vintage_a}..{vintage_b}")

    points: list[PanelPoint] = []
    for obs_date in sorted(map_a.keys() | map_b.keys()):
        va = map_a.get(obs_date)
        vb = map_b.get(obs_date)
        revision = vb - va if (va is not None and vb is not None) else None
        revision_pct = revision / va * 100.0 if (revision is not None and va) else None
        points.append(
            PanelPoint(
                observation_date=obs_date, value_a=va, value_b=vb,
                revision=revision, revision_pct=revision_pct,
            )
        )

    # Summary over the FULL aligned set (before any downsample) so the stats are exact.
    revisions = [p.revision for p in points if p.revision is not None]
    abs_revisions = [abs(r) for r in revisions]
    n_compared = len(revisions)
    summary = PanelSummary(
        n_compared=n_compared,
        n_revised=sum(1 for r in revisions if r != 0),
        mean_revision=sum(revisions) / n_compared if n_compared else None,
        mean_abs_revision=sum(abs_revisions) / n_compared if n_compared else None,
        max_abs_revision=max(abs_revisions) if abs_revisions else None,
    )

    downsampled = bool(max_points and len(points) > max_points)
    if downsampled:
        points = _downsample_points(points, max_points)

    return PanelResponse(
        ticker=ticker,
        vintage_a=vintage_a,
        vintage_b=vintage_b,
        commercial_ok=bool(meta.commercial_ok),
        attribution=meta.attribution or "",
        downsampled=downsampled,
        summary=summary,
        points=points,
    )


# ── Revision history (multi-vintage) — the workbench data source ──────────────────────────
# Every information-state of each observation in the window (NOT point-in-time): how each number was
# revised across successive vintages. Powers the convergence curve (mean abs revision by release age)
# and the fixed-event track (one period across all its vintages). Regime-A (revisable) series only —
# a market series (regime B) has one vintage per observation, so there is nothing to revise.


class RevisionVintage(BaseModel):
    vintage_date: date
    value: float


class RevisionObservation(BaseModel):
    observation_date: date
    vintages: list[RevisionVintage]  # ordered by vintage_date ASC (first print -> ... -> latest)


class RevisionsResponse(BaseModel):
    ticker: str
    commercial_ok: bool
    attribution: str
    observations: list[RevisionObservation]


@router.get("/{ticker}/revisions", response_model=RevisionsResponse, operation_id="get_series_revisions")
async def get_series_revisions(
    ticker: str,
    start: date | None = None,
    end: date | None = None,
    session: AsyncSession = Depends(get_async_session),
) -> RevisionsResponse:
    """The full revision history of `ticker` over [start, end] — each observation's successive vintages."""
    meta = (
        await session.execute(
            text("SELECT commercial_ok, attribution, vintage_capable FROM series WHERE series_id = :s"),
            {"s": ticker},
        )
    ).first()
    if meta is None:
        raise CatalogNotFound(ticker)
    if not meta.vintage_capable:
        raise InvalidRequest(
            f"'{ticker}' is not vintage-capable; revision history needs a revisable (regime A) series."
        )

    result = await session.execute(
        REVISIONS_SQL,
        {
            "series_id": ticker,
            "start": start or date(1900, 1, 1),
            "end": end or date(9999, 12, 31),
            "row_cap": MAX_ROWS + 1,
        },
    )
    rows = result.all()
    if len(rows) > MAX_ROWS:
        raise ResultTooLarge(MAX_ROWS)
    if not rows:
        raise SeriesDataNotFound(ticker, "revisions")

    # Rows are ordered (observation_date, vintage_date), so groupby yields each observation's release
    # sequence in one pass (never gather/sort in app code — the SQL ORDER BY already did it).
    observations = [
        RevisionObservation(
            observation_date=obs_date,
            vintages=[RevisionVintage(vintage_date=r.vintage_date, value=r.value) for r in group],
        )
        for obs_date, group in groupby(rows, key=lambda r: r.observation_date)
    ]
    return RevisionsResponse(
        ticker=ticker,
        commercial_ok=bool(meta.commercial_ok),
        attribution=meta.attribution or "",
        observations=observations,
    )


# ── Revision statistics — the reliability readout + sample-AND-persistence-gated bias test ──
# Computed server-side (HAC/EWC + a Student-t CDF belong in Python, not ECharts) over the same full
# vintage history /revisions exposes. Pure-Python (no numpy/statsmodels); see app/api/revision_stats.py.
# Returns a dict (the shape is nullable-heavy + has an `unavailable` variant) rather than a fixed model.


@router.get("/{ticker}/revision-stats", operation_id="get_series_revision_stats")
async def get_series_revision_stats(
    ticker: str,
    start: date | None = None,
    end: date | None = None,
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    """Revision diagnostics (MR/MAR/RMSR, persistence, a gated bias test + a plain-language readout)."""
    meta = (
        await session.execute(
            text("SELECT commercial_ok, attribution, vintage_capable, frequency FROM series WHERE series_id = :s"),
            {"s": ticker},
        )
    ).first()
    if meta is None:
        raise CatalogNotFound(ticker)
    if not meta.vintage_capable:
        raise InvalidRequest(
            f"'{ticker}' is not vintage-capable; revision stats need a revisable (regime A) series."
        )

    result = await session.execute(
        REVISIONS_SQL,
        {
            "series_id": ticker,
            "start": start or date(1900, 1, 1),
            "end": end or date(9999, 12, 31),
            "row_cap": MAX_ROWS + 1,
        },
    )
    rows = result.all()
    if len(rows) > MAX_ROWS:
        raise ResultTooLarge(MAX_ROWS)

    # Group into each observation's (vintage_date, value) sequence (ordered by observation_date, vintage_date).
    observations = [
        (obs_date, [(r.vintage_date, r.value) for r in group])
        for obs_date, group in groupby(rows, key=lambda r: r.observation_date)
    ]
    # A strictly-positive-level series (e.g. a price index) makes sign-correctness trivially 1.0 -> suppress it.
    strictly_positive = bool(observations) and all(v > 0 for _d, vv in observations for _vd, v in vv)

    stats = compute_revision_stats(
        observations,
        frequency=meta.frequency or "M",
        commercial_ok=bool(meta.commercial_ok),
        attribution=meta.attribution or "",
        strictly_positive_level=strictly_positive,
    )
    return {"ticker": ticker, **stats}