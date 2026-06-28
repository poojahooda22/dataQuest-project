"""The ECB (European Central Bank) euro FX reference-rate fetcher — our second source.

Two things differ from ALFRED, and both are the lesson of this file:
  1. The ECB publishes ONE static XML file of daily euro reference rates back to 1999, with
     NO API key (easier than FRED). So we parse XML, not JSON.
  2. FX rates are Regime B (market observables, never revised), so for every row
     vintage_date == observation_date — there is only one version of a given day's rate.

Licence: ECB grants free reuse WITH mandatory attribution ("Source: European Central Bank")
and there is no service-layer/API restriction (static public file) — adversarially verified
GREEN, so commercial_ok=True here. See .claude/memory/sources-ledger.md.
"""

import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone

import httpx

from app.ingest.errors import EmptyData, Unavailable
from app.ingest.sources.base import Fetcher
from app.ingest.standard import Provenance, QdfRow

ECB_HIST_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml"


class EcbFetcher(Fetcher):
    # STEP 1 - which currency to pull out of the file (no API key needed for the ECB)
    def transform_query(self, source_series_id: str) -> dict:
        return {"currency": source_series_id}  # e.g. "USD" -> the EUR/USD rate

    # STEP 2 - fetch the raw XML (no shaping). We thread the currency through to step 3,
    # because transform_data needs to know which currency to extract from the file.
    def extract_data(self, native: dict) -> list[dict]:
        try:
            with httpx.Client(timeout=60) as client:
                response = client.get(ECB_HIST_URL)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise Unavailable(f"ECB fetch failed: {exc}") from exc
        return [{"currency": native["currency"], "xml": response.text}]

    # STEP 3 - parse the XML into QdfRows. Regime B -> vintage_date == observation_date.
    def transform_data(self, raw: list[dict]) -> tuple[list[QdfRow], Provenance]:
        currency = raw[0]["currency"]
        root = ET.fromstring(raw[0]["xml"])
        rows: list[QdfRow] = []
        # The file nests <Cube><Cube time="YYYY-MM-DD"><Cube currency="USD" rate="1.09"/>...
        # Match by LOCAL tag name (endswith "Cube") so the XML namespace doesn't matter.
        # (Note: iter() does NOT support the "{*}" namespace wildcard — only findall() does.)
        for day in root.iter():
            if not day.tag.endswith("Cube"):
                continue
            day_time = day.get("time")
            if not day_time:  # only the daily nodes carry a time= attribute
                continue
            for rate_node in day:
                if rate_node.tag.endswith("Cube") and rate_node.get("currency") == currency:
                    obs = date.fromisoformat(day_time)
                    rows.append(QdfRow(observation_date=obs, vintage_date=obs, value=float(rate_node.get("rate"))))
        if not rows:
            raise EmptyData(f"ECB returned no rates for currency {currency}")
        provenance = Provenance(
            source="ECB",
            fetched_at=datetime.now(timezone.utc),
            commercial_ok=True,  # GREEN: free reuse + attribution, no service-layer ToS (verified)
            attribution="Source: European Central Bank",
        )
        return rows, provenance