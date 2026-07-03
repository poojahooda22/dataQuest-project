"""Treasury FiscalData MSPD source — marketable US Treasuries as index CANDIDATES.

Unlike the series Fetchers (which return QdfRow observation rows), this returns `Candidate`
constituents for the index engine. It reads the Monthly Statement of the Public Debt (MSPD),
Table 3 "Detail of Marketable Treasury Securities", per-CUSIP.

Field semantics verified against the live API (api.fiscaldata.treasury.gov):
  - `outstanding_amt` / `issued_amt` are IN MILLIONS of USD (per the API's own field labels), so a
    value of 500.0 == US$500M — directly comparable to the index's min_face_usd_mn.
  - `security_class2_desc` is the 9-character CUSIP for real securities; NON-9-char values are
    SUBTOTAL / TOTAL rows (e.g. "Total Marketable") and MUST be dropped — summing per-CUSIP
    `outstanding_amt` over only the 9-char rows reconciles to the published Total Marketable, whereas
    including the subtotal rows triple-counts it.
  - a CUSIP can appear on MULTIPLE rows (bill reopenings); we GROUP BY CUSIP and SUM the outstanding
    so each security's face is its true total. (Bills are excluded from the index by the >=2.5y
    maturity screen regardless.)

We restrict to nominal coupon securities — `security_class1_desc` in {Notes, Bonds} — so the face
weights are clean par amounts (TIPS carry an inflation adjustment; FRNs float; bills are sub-2y).

Licence: Bureau of the Fiscal Service is a US federal bureau -> 17 USC 105 public domain; the FiscalData
About page states the data may be used for commercial and non-commercial purposes. Kept
DISPLAY-provisional (commercial_ok stays FALSE on the index) until the first-party ToS page is read in a
browser (it WAF-blocks automated fetchers). See .claude/memory/sources-ledger.md.
"""

from datetime import date

import httpx

from app.ingest.errors import EmptyData, Unavailable
from app.ingest.index_engine import Candidate

MSPD_TABLE_3_URL = (
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/debt/mspd/mspd_table_3_market"
)
_NOMINAL_COUPON_TYPES = {"Notes", "Bonds"}
_PAGE_SIZE = 500
_MAX_PAGES = 20  # ~880 marketable rows/month -> 2 pages; the cap is a runaway guard


def _latest_record_date(client: httpx.Client) -> date:
    resp = client.get(MSPD_TABLE_3_URL, params={"sort": "-record_date", "page[size]": "1", "fields": "record_date"})
    resp.raise_for_status()
    data = resp.json().get("data", [])
    if not data:
        raise EmptyData("MSPD returned no records")
    return date.fromisoformat(data[0]["record_date"])


def _fetch_month(client: httpx.Client, record_date: date) -> list[dict]:
    rows: list[dict] = []
    for page in range(1, _MAX_PAGES + 1):
        resp = client.get(
            MSPD_TABLE_3_URL,
            params={
                "filter": f"record_date:eq:{record_date.isoformat()},security_type_desc:eq:Marketable",
                "fields": "security_class1_desc,security_class2_desc,maturity_date,outstanding_amt",
                "page[size]": str(_PAGE_SIZE),
                "page[number]": str(page),
            },
        )
        resp.raise_for_status()
        batch = resp.json().get("data", [])
        rows.extend(batch)
        if len(batch) < _PAGE_SIZE:
            break
    return rows


class MspdTreasurySource:
    """Constituent source for the US Treasury index. Returns (rebalance_date, candidates)."""

    source = "FISCALDATA_MSPD"
    attribution = "Source: U.S. Department of the Treasury, Bureau of the Fiscal Service (MSPD)"

    def fetch_candidates(self, as_of: date) -> tuple[date, list[Candidate]]:
        try:
            with httpx.Client(timeout=60) as client:
                record_date = _latest_record_date(client)
                raw = _fetch_month(client, record_date)
        except httpx.HTTPError as exc:
            raise Unavailable(f"MSPD fetch failed: {exc}") from exc

        # Group by real 9-char CUSIP, summing outstanding across a CUSIP's rows; keep nominal coupons only.
        faces: dict[str, float] = {}
        meta: dict[str, tuple[str, date]] = {}  # cusip -> (type, maturity)
        for r in raw:
            cusip = r.get("security_class2_desc", "")
            if len(cusip) != 9:  # subtotal / total rows -> drop
                continue
            klass = r.get("security_class1_desc", "")
            if klass not in _NOMINAL_COUPON_TYPES:
                continue
            amt = r.get("outstanding_amt")
            mat = r.get("maturity_date")
            if amt in (None, "null", "") or mat in (None, "null", ""):
                continue
            faces[cusip] = faces.get(cusip, 0.0) + float(amt)
            meta.setdefault(cusip, (klass, date.fromisoformat(mat)))

        if not faces:
            raise EmptyData("MSPD returned no nominal-coupon marketable Treasuries")

        candidates = [
            Candidate(
                constituent_id=cusip,
                name=f"US Treasury {meta[cusip][0].rstrip('s')} {meta[cusip][1].isoformat()}",
                cid="USD",
                face_amount=face,
                years_to_maturity=(meta[cusip][1] - record_date).days / 365.25,
                income_history=(),  # no income screen for a single-issuer government index
            )
            for cusip, face in faces.items()
        ]
        return record_date, candidates
