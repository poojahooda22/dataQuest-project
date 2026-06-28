"""The ALFRED (St. Louis Fed) fetcher — our first real data source.

ALFRED is FRED's point-in-time API. The trick: asking with realtime_start=earliest and
realtime_end=latest returns EVERY version of every observation across history, each
tagged with the date it became known. That revision history is the fuel for the time
machine.
"""

from datetime import date, datetime, timezone

import httpx

from app.core.config import settings
from app.ingest.errors import EmptyData, NeedsKey, Unavailable
from app.ingest.sources.base import Fetcher
from app.ingest.standard import Provenance, QdfRow

FRED_OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations"


class AlfredFetcher(Fetcher):
    # STEP 1 - build the request (params only, no network)
    def transform_query(self, source_series_id: str) -> dict:
        if not settings.fred_api_key:
            raise NeedsKey("FRED_API_KEY is not set")
        return {
            "series_id": source_series_id,
            "realtime_start": "1776-07-04",  # earliest -> give me ALL vintages,
            "realtime_end": "9999-12-31",    # latest      not just today's values
            "api_key": settings.fred_api_key,
            "file_type": "json",
        }

    # STEP 2 - fetch the raw JSON (no shaping)
    def extract_data(self, native: dict) -> list[dict]:
        try:
            with httpx.Client(timeout=30) as client:  # the WRITE path may fetch upstream
                response = client.get(FRED_OBSERVATIONS_URL, params=native)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise Unavailable(f"ALFRED fetch failed: {exc}") from exc
        observations = response.json().get("observations", [])
        if not observations:
            raise EmptyData("ALFRED returned no observations")
        return observations

    # STEP 3 - clean the raw rows into QdfRows + a Provenance stamp (no network)
    def transform_data(self, raw: list[dict]) -> tuple[list[QdfRow], Provenance]:
        rows = [
            QdfRow(
                observation_date=date.fromisoformat(obs["date"]),
                vintage_date=date.fromisoformat(obs["realtime_start"]),  # when first known
                value=float(obs["value"]),
            )
            for obs in raw
            if obs["value"] != "."  # "." = missing in FRED -> SKIP, never invent a number
        ]
        if not rows:
            raise EmptyData("all ALFRED values were missing")
        provenance = Provenance(
            source="ALFRED",
            fetched_at=datetime.now(timezone.utc),
            commercial_ok=False,  # stays FALSE until the ALFRED fetch path is ledgered GREEN (Step D)
            attribution="Source: U.S. BLS via ALFRED",
        )
        return rows, provenance


class FredLatestFetcher(AlfredFetcher):
    """FRED current-observations fetcher for NON-revisable (regime B) series — market rates etc.

    The all-vintages request (realtime 1776->9999) on a DAILY series explodes the
    observation x vintage cross-product past FRED's row cap and 400s. A market rate is never
    revised, so it needs no vintage history: omit the realtime params (FRED returns the current
    values) and set vintage_date == observation_date by construction.
    """

    # STEP 1 - current observations only (no realtime range -> no vintage cross-product)
    def transform_query(self, source_series_id: str) -> dict:
        if not settings.fred_api_key:
            raise NeedsKey("FRED_API_KEY is not set")
        return {
            "series_id": source_series_id,
            "api_key": settings.fred_api_key,
            "file_type": "json",
        }

    # STEP 3 - vintage_date == observation_date (market observable, PIT by construction)
    def transform_data(self, raw: list[dict]) -> tuple[list[QdfRow], Provenance]:
        rows = [
            QdfRow(
                observation_date=date.fromisoformat(obs["date"]),
                vintage_date=date.fromisoformat(obs["date"]),
                value=float(obs["value"]),
            )
            for obs in raw
            if obs["value"] != "."  # "." = missing in FRED -> SKIP, never invent a number
        ]
        if not rows:
            raise EmptyData("all FRED values were missing")
        provenance = Provenance(
            source="ALFRED",
            fetched_at=datetime.now(timezone.utc),
            commercial_ok=False,
            attribution="Source: U.S. Treasury / Federal Reserve via FRED",
        )
        return rows, provenance