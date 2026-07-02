"""The Philadelphia Fed Real-Time Data Set (RTDS) fetcher — a FILE-based vintage source.

Why this exists: the FRED/ALFRED API is the only API that exposes US-macro vintages, but its
ToS encumbers caching/display (decision 0004). The RTDS is the GREEN, contract-free alternative
for the vintage moat: the Philly Fed publishes downloadable XLSX files where each COLUMN is a
vintage (the series AS PUBLISHED on that vintage date) and each ROW is an observation period —
exactly our bitemporal `observation_date x vintage_date -> value` shape.

Two things differ from the API fetchers:
  1. The source is a static XLSX file (parsed with openpyxl), not JSON/XML over an API.
  2. It is Regime A (revisable) WITH a real vintage archive — like ALFRED, but file-based and
     free of the FRED API contract.

Licence (RTDS terms read first-party, logged in sources-ledger): the data is © Federal Reserve Bank
of Philadelphia ("All rights reserved"; no terms-of-use page, no redistribution grant). A regional
Reserve Bank is NOT a federal agency, so 17 USC §105 public-domain does NOT apply to the vintage
compilation. Display/chart with attribution is the intended research use; DOWNLOAD / file-redistribution
is RED. `commercial_ok` stays FALSE and any future `downloadable` gate stays FALSE.
"""

import io
import re
from datetime import date, datetime, timezone

import httpx
import openpyxl

from app.ingest.errors import EmptyData, Unavailable
from app.ingest.sources.base import Fetcher
from app.ingest.standard import Provenance, QdfRow

# RTDS data files live under one media path; the file stem (e.g. "ROUTPUTQvQd") is the series id.
# The path-only URL serves the file (the page's ?hash= cache-buster is NOT required — verified).
RTDS_BASE_URL = "https://www.philadelphiafed.org/-/media/FRBP/Assets/Surveys-And-Data/real-time-data/data-files/xlsx"
# The site User-Agent-blocks non-browser clients (the docs 403 a default fetch) — send a browser UA.
_BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

# A vintage column header ends in "<YY>Q<Q>" (quarterly, e.g. ROUTPUT65Q4) OR "<YY>M<MM>"
# (monthly, e.g. EMPLOY64M12). The prefix varies per variable, so match only the trailing
# year-quarter / year-month — this generalizes to any RTDS file.
_VINTAGE_Q_RE = re.compile(r"(\d{2})Q([1-4])$")
_VINTAGE_M_RE = re.compile(r"(\d{2})M(\d{1,2})$")


def _yy_to_year(yy: int) -> int:
    """2-digit RTDS year -> 4-digit (data starts 1964/1965; pivot at 50)."""
    return 2000 + yy if yy < 50 else 1900 + yy


def _parse_obs(label: str) -> date:
    """The observation period -> its first day. Quarterly '1947:Q1' or monthly '1947:01'."""
    year_str, period = label.split(":")
    year = int(year_str)
    if period[:1] in ("Q", "q"):
        quarter = int(period[1:])
        return date(year, (quarter - 1) * 3 + 1, 1)
    return date(year, int(period), 1)


def _vintage_date(header: str) -> date | None:
    """Decode an RTDS vintage column header to its vintage date — the 15th of the representative
    month (the RTDS mid-period convention; the exact day is per gen_doc). Quarterly '<YY>Q<Q>'
    -> 15th of the quarter's middle month (Q1->Feb, Q2->May, Q3->Aug, Q4->Nov); monthly
    '<YY>M<MM>' -> the 15th of that month."""
    q = _VINTAGE_Q_RE.search(header)
    if q:
        return date(_yy_to_year(int(q.group(1))), (int(q.group(2)) - 1) * 3 + 2, 15)
    m = _VINTAGE_M_RE.search(header)
    if m:
        return date(_yy_to_year(int(m.group(1))), int(m.group(2)), 15)
    return None


class PhillyFedRtdsFetcher(Fetcher):
    # STEP 1 - which file to pull (params only, no network). source_series_id = the file stem.
    def transform_query(self, source_series_id: str) -> dict:
        return {"url": f"{RTDS_BASE_URL}/{source_series_id}.xlsx"}

    # STEP 2 - download the raw XLSX bytes (no shaping). Browser UA, else the site 403s.
    def extract_data(self, native: dict) -> list[dict]:
        try:
            with httpx.Client(timeout=90, headers={"User-Agent": _BROWSER_UA}) as client:
                response = client.get(native["url"])
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise Unavailable(f"Philly Fed RTDS fetch failed: {exc}") from exc
        return [{"xlsx": response.content}]

    # STEP 3 - melt the wide vintage matrix into long QdfRows (no network).
    def transform_data(self, raw: list[dict]) -> tuple[list[QdfRow], Provenance]:
        workbook = openpyxl.load_workbook(io.BytesIO(raw[0]["xlsx"]), read_only=True, data_only=True)
        sheet = workbook.active
        row_iter = sheet.iter_rows(values_only=True)
        header = next(row_iter)
        # Pre-decode each vintage column once: (column index, vintage_date).
        vintage_cols = [
            (col_idx, vd)
            for col_idx, cell in enumerate(header)
            if col_idx > 0 and (vd := _vintage_date(str(cell))) is not None
        ]
        rows: list[QdfRow] = []
        for data_row in row_iter:
            label = data_row[0]
            if not label or ":" not in str(label):  # skip blank/footnote rows
                continue
            try:
                obs_date = _parse_obs(str(label))
            except (ValueError, IndexError):
                continue
            for col_idx, vintage_date in vintage_cols:
                value = data_row[col_idx]
                if value is None or value == "":  # a vintage has no value for that period -> SKIP, never invent
                    continue
                try:
                    rows.append(QdfRow(observation_date=obs_date, vintage_date=vintage_date, value=float(value)))
                except (TypeError, ValueError):
                    continue  # "#N/A" / non-numeric -> skip
        workbook.close()
        if not rows:
            raise EmptyData("Philly Fed RTDS file parsed to zero rows")
        provenance = Provenance(
            source="PHILLYFED",
            fetched_at=datetime.now(timezone.utc),
            commercial_ok=False,  # stays FALSE until the RTDS terms are first-party read + ledgered GREEN
            attribution="Source: Federal Reserve Bank of Philadelphia, Real-Time Data Set for Macroeconomists",
        )
        return rows, provenance