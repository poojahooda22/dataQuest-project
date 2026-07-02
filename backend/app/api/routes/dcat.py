"""DCAT-v3 catalog export — GET /api/v1/catalog.jsonld.

The whole catalog serialized as W3C DCAT v3 JSON-LD (the open standard J.P. Morgan documents Fusion's
catalog against), so any machine / data tool / agent can ingest it in ONE request. Structure mirrors our
ontology: dcat:Catalog -> dcat:catalog (one sub-catalog per Data Product) -> dcat:dataset (one per Series)
-> dcat:distribution (the live API access). Every node carries the per-fetch-path licence verdict —
dct:license (the legal doc) + dct:rights (attribution) + our custom dquest:commercialOk (display) /
dquest:downloadable (redistribution). This is METADATA ONLY (no data values), so there is no redistribution
gate on the export itself. Reads ONLY our store (read never fetches).

R-SCALE: built from three indexed reads (products + series + one MIN/MAX(observation_date) aggregate);
compute-once-serve-many. At catalog scale, cron-warm the JSON-LD into a cached blob (it changes only when
the worker adds a series). Fine uncached at this catalog size.
"""

from datetime import date

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.db import get_async_session
from app.models import DataProduct, Series

router = APIRouter(tags=["dcat"])

# JSON-LD namespace map. dcat/dct/foaf/xsd are W3C standards; dquest is OUR namespace (the display/download
# verdicts are our rulings, deliberately NOT faked as DCAT properties — DCAT has no such boolean).
_DCAT_CONTEXT = {
    "dcat": "http://www.w3.org/ns/dcat#",
    "dct": "http://purl.org/dc/terms/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "dquest": "https://dataquest.dev/ns#",
}

# frequency (our M/Q/D/W/A) -> dcat:temporalResolution (ISO-8601 duration = bar spacing) and the EU
# Publications Office accrual-frequency URI (dct:accrualPeriodicity = refresh cadence). Distinct properties.
_RESOLUTION = {"D": "P1D", "W": "P7D", "M": "P1M", "Q": "P3M", "A": "P1Y"}
_ACCRUAL = {
    "D": "http://publications.europa.eu/resource/authority/frequency/DAILY",
    "W": "http://publications.europa.eu/resource/authority/frequency/WEEKLY",
    "M": "http://publications.europa.eu/resource/authority/frequency/MONTHLY",
    "Q": "http://publications.europa.eu/resource/authority/frequency/QUARTERLY",
    "A": "http://publications.europa.eu/resource/authority/frequency/ANNUAL",
}
# per-source licence DOCUMENT (the dct:license URI). The verdict booleans live in dquest:* alongside it.
# DCTERMS requires a LicenseDocument here — a source with NO published licence document (PHILLYFED: © all
# rights reserved, no terms page exists per the first-party read in the sources-ledger) is OMITTED, never
# pointed at a homepage or an empty string; its restriction is carried by dquest:commercialOk=false.
_LICENSE_URI = {
    "ALFRED": "https://www.usa.gov/government-works",
    "ALFRED_LATEST": "https://www.usa.gov/government-works",
    "ECB": "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html",
}


def _dataset_node(s: Series, base: str, coverage: dict[str, tuple[date, date]]) -> dict:
    """One Series -> a dcat:Dataset with a single API-access dcat:Distribution. The licence lives on the
    Distribution (the fetch path) per DCAT, mirrored on the Dataset for convenience."""
    license_uri = _LICENSE_URI.get(s.source)
    distribution: dict = {
        "@type": "dcat:Distribution",
        "dct:title": f"{s.description or s.series_id} — via the DataQuest API (JSON)",
        "dcat:accessURL": f"{base}/api/v1/series/{s.series_id}",
        "dcat:mediaType": "application/json",
        "dct:rights": s.attribution,
        "dquest:commercialOk": bool(s.commercial_ok),
        "dquest:downloadable": bool(s.downloadable),
    }
    node: dict = {
        "@id": f"{base}/api/v1/series/{s.series_id}",
        "@type": "dcat:Dataset",
        "dct:identifier": s.series_id,
        "dct:title": s.description or s.series_id,
        "dcat:keyword": [k for k in (s.cid, s.xcat, s.qdf_ticker) if k],
        "dct:spatial": s.cid,
        "dct:publisher": {"@type": "foaf:Agent", "foaf:name": "DataQuest"},
        "dct:rights": s.attribution,
        "dquest:commercialOk": bool(s.commercial_ok),
        "dquest:downloadable": bool(s.downloadable),
        "dcat:distribution": [distribution],
    }
    if license_uri:  # DCTERMS: dct:license must be a LicenseDocument — omit when none exists
        node["dct:license"] = license_uri
        distribution["dct:license"] = license_uri
    if s.frequency in _RESOLUTION:
        node["dcat:temporalResolution"] = {"@type": "xsd:duration", "@value": _RESOLUTION[s.frequency]}
        node["dct:accrualPeriodicity"] = _ACCRUAL[s.frequency]
    cov = coverage.get(s.series_id)
    if cov:
        lo, hi = cov
        node["dct:temporal"] = {
            "@type": "dct:PeriodOfTime",
            "dcat:startDate": {"@type": "xsd:date", "@value": lo.isoformat()},
            "dcat:endDate": {"@type": "xsd:date", "@value": hi.isoformat()},
        }
    return node


@router.get("/catalog.jsonld", operation_id="get_catalog_dcat")
async def catalog_jsonld(
    request: Request, session: AsyncSession = Depends(get_async_session)
) -> JSONResponse:
    """The whole catalog as W3C DCAT v3 JSON-LD."""
    base = str(request.base_url).rstrip("/")

    products = (
        await session.execute(select(DataProduct).order_by(DataProduct.sort_order))
    ).scalars().all()
    series = (await session.execute(select(Series).order_by(Series.series_id))).scalars().all()
    cov_rows = (
        await session.execute(
            text(
                "SELECT series_id, MIN(observation_date) AS lo, MAX(observation_date) AS hi "
                "FROM observation GROUP BY series_id"
            )
        )
    ).all()
    coverage: dict[str, tuple[date, date]] = {r.series_id: (r.lo, r.hi) for r in cov_rows}

    by_product: dict[str, list[Series]] = {}
    ungrouped: list[Series] = []
    for s in series:
        if s.product_id:
            by_product.setdefault(s.product_id, []).append(s)
        else:
            ungrouped.append(s)

    sub_catalogs = [
        {
            "@id": f"{base}/api/v1/products/{p.product_id}",
            "@type": "dcat:Catalog",
            "dct:title": p.title,
            "dct:description": p.description,
            "dcat:theme": p.theme,
            "dcat:dataset": [_dataset_node(s, base, coverage) for s in by_product.get(p.product_id, [])],
        }
        for p in products
    ]

    catalog: dict = {
        "@context": _DCAT_CONTEXT,
        "@id": f"{base}/api/v1/catalog.jsonld",
        "@type": "dcat:Catalog",
        "dct:title": "DataQuest — Point-in-Time Macro Data Catalog",
        "dct:description": (
            "Normalized, point-in-time macro-economic time series over public-domain sources, with a "
            "per-series commercial-display and file-redistribution licence verdict on every entry."
        ),
        "dct:publisher": {"@type": "foaf:Agent", "foaf:name": "DataQuest"},
        "dcat:catalog": sub_catalogs,
    }
    if ungrouped:
        catalog["dcat:dataset"] = [_dataset_node(s, base, coverage) for s in ungrouped]

    return JSONResponse(content=catalog, media_type="application/ld+json")
