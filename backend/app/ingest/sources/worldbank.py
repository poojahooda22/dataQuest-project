"""World Bank source — emerging-market sovereigns as country-level index CANDIDATES.

Feeds the `em-composition` index. One source, two indicators, both World Bank open data (CC BY 4.0):
  - NY.GNP.PCAP.CD  — GNI per capita, Atlas method (current US$) -> the income-eligibility screen
  - DT.DOD.DPPG.CD  — public & publicly-guaranteed external debt stock (current US$) -> the weight

Why World Bank IDS for the weight (not BIS, as the plan first named): the IDS External Debt series is on
the SAME World Bank API + CC-BY licence as the GNI screen (one integration, one ledger row), and IDS by
construction covers only low/middle-income economies — i.e. exactly the EM universe (DPPG is null for
high-income countries, verified). It is a documented PROXY for sovereign bond supply; BIS International
Debt Securities can refine it later.

Units: DPPG is in current US$; we divide by 1e6 so `face_amount` is in USD MILLIONS, matching the
Treasury source's convention (weights are ratios, so units cancel — the conversion is for display
consistency). Aggregates ("World", "Euro area", regions) are dropped via the country list's
region == "Aggregates" flag.

Licence: World Bank Datasets are CC BY 4.0 (GREEN) with mandatory attribution. See sources-ledger.md.
"""

from datetime import date

import httpx

from app.ingest.errors import EmptyData, Unavailable
from app.ingest.index_engine import Candidate

WB_BASE = "https://api.worldbank.org/v2"
_GNI = "NY.GNP.PCAP.CD"        # GNI per capita, Atlas method (current US$)
_DEBT = "DT.DOD.DPPG.CD"       # PPG external debt stock (current US$)
_GNI_RANGE = "2015:2025"       # enough history for the 3-consecutive-years income screen
_DEBT_RANGE = "2018:2025"


def _indicator(client: httpx.Client, code: str, date_range: str) -> dict[str, dict[str, float | None]]:
    """Fetch one WB indicator for all economies -> {iso3: {year: value_or_None}}."""
    resp = client.get(
        f"{WB_BASE}/country/all/indicator/{code}",
        params={"format": "json", "date": date_range, "per_page": "20000"},
    )
    resp.raise_for_status()
    payload = resp.json()
    if len(payload) < 2 or not payload[1]:
        raise EmptyData(f"World Bank {code} returned no data")
    out: dict[str, dict[str, float | None]] = {}
    for row in payload[1]:
        iso3 = row.get("countryiso3code") or ""
        if not iso3:
            continue
        out.setdefault(iso3, {})[row["date"]] = row["value"]
    return out


def _real_country_names(client: httpx.Client) -> dict[str, str]:
    """{iso3: name} for real economies only (drops WB aggregates like 'World', 'Euro area')."""
    resp = client.get(f"{WB_BASE}/country", params={"format": "json", "per_page": "400"})
    resp.raise_for_status()
    payload = resp.json()
    if len(payload) < 2 or not payload[1]:
        raise EmptyData("World Bank country list returned no data")
    return {c["id"]: c["name"] for c in payload[1] if c["region"]["value"] != "Aggregates"}


class WorldBankEmSource:
    """Constituent source for the EM composition index. Returns (rebalance_date, candidates)."""

    source = "WORLDBANK_IDS"
    attribution = "The World Bank: World Development Indicators & International Debt Statistics (CC BY 4.0)"

    def fetch_candidates(self, as_of: date) -> tuple[date, list[Candidate]]:
        try:
            with httpx.Client(timeout=90) as client:
                names = _real_country_names(client)
                gni = _indicator(client, _GNI, _GNI_RANGE)
                debt = _indicator(client, _DEBT, _DEBT_RANGE)
        except httpx.HTTPError as exc:
            raise Unavailable(f"World Bank fetch failed: {exc}") from exc

        # Single-year snapshot: the latest year any country reports external debt.
        years = sorted({y for d in debt.values() for y, v in d.items() if v is not None})
        if not years:
            raise EmptyData("World Bank returned no external-debt values")
        target = years[-1]
        rebalance_date = date(int(target), 12, 31)

        candidates: list[Candidate] = []
        for iso3, name in names.items():
            face = debt.get(iso3, {}).get(target)
            if face is None:  # no external debt stock at the target year -> not an EM debt issuer
                continue
            history = tuple(
                v for _, v in sorted(gni.get(iso3, {}).items()) if v is not None
            )  # GNI oldest -> newest, non-null only
            if not history:
                continue
            candidates.append(
                Candidate(
                    constituent_id=iso3,
                    name=name,
                    cid=iso3,
                    face_amount=float(face) / 1e6,  # current US$ -> USD millions
                    years_to_maturity=None,          # country-level: the maturity screen does not apply
                    income_history=history,
                )
            )
        if not candidates:
            raise EmptyData("no EM candidates assembled from World Bank data")
        return rebalance_date, candidates
