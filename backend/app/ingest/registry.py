"""The catalog seed + the {source -> Fetcher} map.

This is THE one extension point for new data: to add a series, add its catalog row here
(and a Fetcher for its source) and run the worker — the read API then serves it with zero
code change. A ticker is "available" only after its source has been ingested.
"""

from app.ingest.sources.alfred import AlfredFetcher, FredLatestFetcher
from app.ingest.sources.ecb import EcbFetcher
from app.ingest.sources.phillyfed import PhillyFedRtdsFetcher
from app.models import DataProduct, Series

# The v1 catalog. The per-series licence verdicts — `commercial_ok` (cleared for commercial DISPLAY)
# and `downloadable` (cleared to redistribute as a FILE) — are NOT set inline; they are assigned per
# SOURCE from the ledger-verified `_LICENSE` map at the bottom of this file (the single source of truth,
# matching .claude/memory/sources-ledger.md). Default-deny: both default False on the model.
V1_SERIES = [
    Series(
        series_id="USD_CPIAUCSL",
        cid="USD",
        xcat="CPIAUCSL",
        source="ALFRED",
        source_series_id="CPIAUCSL",
        regime="A",  # revisable statistic -> needs vintages
        vintage_capable=True,
        attribution=(
            "U.S. Bureau of Labor Statistics, Consumer Price Index for All Urban "
            "Consumers: All Items [CPIAUCSL], retrieved from FRED, Federal Reserve "
            "Bank of St. Louis"
        ),
        frequency="M",
        description="US CPI, all items, seasonally adjusted",
    ),
    # More US indicators from the SAME ALFRED source — no new code, just catalog rows.
    # All US-gov public-domain (BLS/BEA); licence verdicts are assigned per source from `_LICENSE`
    # below — display-GREEN, download-RED under the FRED-API-ToS caveat. See the sources-ledger.
    Series(
        series_id="USD_UNRATE", cid="USD", xcat="UNRATE",
        source="ALFRED", source_series_id="UNRATE",
        regime="A", vintage_capable=True,
        attribution="U.S. Bureau of Labor Statistics, Unemployment Rate [UNRATE], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US unemployment rate (U-3), seasonally adjusted",
    ),
    Series(
        series_id="USD_PAYEMS", cid="USD", xcat="PAYEMS",
        source="ALFRED", source_series_id="PAYEMS",
        regime="A", vintage_capable=True,
        attribution="U.S. Bureau of Labor Statistics, All Employees: Total Nonfarm [PAYEMS], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US nonfarm payroll employment, SA (thousands of persons)",
    ),
    Series(
        series_id="USD_GDPC1", cid="USD", xcat="GDPC1",
        source="ALFRED", source_series_id="GDPC1",
        regime="A", vintage_capable=True,
        attribution="U.S. Bureau of Economic Analysis, Real Gross Domestic Product [GDPC1], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="Q", description="US real GDP, SA annual rate (chained 2017 dollars)",
    ),

    # ── Catalog expansion — more US-gov public-domain series via the SAME ALFRED fetcher ──
    # All BLS / BEA / U.S. Census / Federal Reserve / U.S. Treasury / DOL underlying → 17 USC §105
    # public domain (display-GREEN; download-RED under the FRED-API-ToS caveat — see `_LICENSE` below
    # + the sources-ledger). Deliberately NO third-party FRED series (no CBOE/VIX,
    # S&P/DJ/Nasdaq, U-Michigan sentiment, Freddie-Mac PMMS) — FRED *hosting* ≠ public domain.

    # Inflation (BLS / BEA, revisable → regime A, vintage-capable)
    Series(series_id="USD_CPILFESL", cid="USD", xcat="CPILFESL", source="ALFRED", source_series_id="CPILFESL",
        regime="A", vintage_capable=True,
        attribution="U.S. Bureau of Labor Statistics, Consumer Price Index for All Urban Consumers: All Items Less Food and Energy [CPILFESL], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US core CPI (all items less food & energy), SA"),
    Series(series_id="USD_PCEPI", cid="USD", xcat="PCEPI", source="ALFRED", source_series_id="PCEPI",
        regime="A", vintage_capable=True,
        attribution="U.S. Bureau of Economic Analysis, Personal Consumption Expenditures: Chain-type Price Index [PCEPI], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US PCE price index, SA"),
    Series(series_id="USD_PCEPILFE", cid="USD", xcat="PCEPILFE", source="ALFRED", source_series_id="PCEPILFE",
        regime="A", vintage_capable=True,
        attribution="U.S. Bureau of Economic Analysis, Personal Consumption Expenditures Excluding Food and Energy (Chain-Type Price Index) [PCEPILFE], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US core PCE price index (ex food & energy), SA"),
    Series(series_id="USD_PPIACO", cid="USD", xcat="PPIACO", source="ALFRED", source_series_id="PPIACO",
        regime="A", vintage_capable=True,
        attribution="U.S. Bureau of Labor Statistics, Producer Price Index by Commodity: All Commodities [PPIACO], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US producer price index, all commodities"),

    # Labor (BLS / DOL, revisable → regime A)
    Series(series_id="USD_CIVPART", cid="USD", xcat="CIVPART", source="ALFRED", source_series_id="CIVPART",
        regime="A", vintage_capable=True,
        attribution="U.S. Bureau of Labor Statistics, Labor Force Participation Rate [CIVPART], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US labor force participation rate (%), SA"),
    Series(series_id="USD_ICSA", cid="USD", xcat="ICSA", source="ALFRED", source_series_id="ICSA",
        regime="A", vintage_capable=True,
        attribution="U.S. Employment and Training Administration, Initial Claims [ICSA], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="W", description="US initial jobless claims, SA"),
    Series(series_id="USD_AHETPI", cid="USD", xcat="AHETPI", source="ALFRED", source_series_id="AHETPI",
        regime="A", vintage_capable=True,
        attribution="U.S. Bureau of Labor Statistics, Average Hourly Earnings of Production and Nonsupervisory Employees, Total Private [AHETPI], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US average hourly earnings, production & nonsupervisory, SA"),
    Series(series_id="USD_JTSJOL", cid="USD", xcat="JTSJOL", source="ALFRED", source_series_id="JTSJOL",
        regime="A", vintage_capable=True,
        attribution="U.S. Bureau of Labor Statistics, Job Openings: Total Nonfarm [JTSJOL], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US job openings (JOLTS), total nonfarm, SA (thousands)"),

    # Growth / activity (Federal Reserve / BEA / Census, revisable → regime A)
    Series(series_id="USD_INDPRO", cid="USD", xcat="INDPRO", source="ALFRED", source_series_id="INDPRO",
        regime="A", vintage_capable=True,
        attribution="Board of Governors of the Federal Reserve System (US), Industrial Production: Total Index [INDPRO], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US industrial production index, SA"),
    Series(series_id="USD_RSAFS", cid="USD", xcat="RSAFS", source="ALFRED", source_series_id="RSAFS",
        regime="A", vintage_capable=True,
        attribution="U.S. Census Bureau, Advance Retail Sales: Retail and Food Services, Total [RSAFS], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US advance retail & food services sales, SA (millions USD)"),
    Series(series_id="USD_HOUST", cid="USD", xcat="HOUST", source="ALFRED", source_series_id="HOUST",
        regime="A", vintage_capable=True,
        attribution="U.S. Census Bureau, New Privately-Owned Housing Units Started: Total Units [HOUST], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US housing starts, total units, SAAR (thousands)"),
    Series(series_id="USD_DGORDER", cid="USD", xcat="DGORDER", source="ALFRED", source_series_id="DGORDER",
        regime="A", vintage_capable=True,
        attribution="U.S. Census Bureau, Manufacturers' New Orders: Durable Goods [DGORDER], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US durable goods new orders, SA (millions USD)"),

    # Rates (U.S. Treasury / Federal Reserve H.15 — market observables, not revised → regime B)
    Series(series_id="USD_DGS10", cid="USD", xcat="DGS10", source="ALFRED_LATEST", source_series_id="DGS10",
        regime="B", vintage_capable=False,
        attribution="Board of Governors of the Federal Reserve System (US), Market Yield on U.S. Treasury Securities at 10-Year Constant Maturity, Quoted on an Investment Basis [DGS10], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="D", description="US 10-year Treasury constant-maturity yield (%)"),
    Series(series_id="USD_DGS2", cid="USD", xcat="DGS2", source="ALFRED_LATEST", source_series_id="DGS2",
        regime="B", vintage_capable=False,
        attribution="Board of Governors of the Federal Reserve System (US), Market Yield on U.S. Treasury Securities at 2-Year Constant Maturity, Quoted on an Investment Basis [DGS2], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="D", description="US 2-year Treasury constant-maturity yield (%)"),
    Series(series_id="USD_DGS3MO", cid="USD", xcat="DGS3MO", source="ALFRED_LATEST", source_series_id="DGS3MO",
        regime="B", vintage_capable=False,
        attribution="Board of Governors of the Federal Reserve System (US), Market Yield on U.S. Treasury Securities at 3-Month Constant Maturity, Quoted on an Investment Basis [DGS3MO], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="D", description="US 3-month Treasury constant-maturity yield (%)"),
    Series(series_id="USD_FEDFUNDS", cid="USD", xcat="FEDFUNDS", source="ALFRED", source_series_id="FEDFUNDS",
        regime="B", vintage_capable=False,
        attribution="Board of Governors of the Federal Reserve System (US), Federal Funds Effective Rate [FEDFUNDS], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US federal funds effective rate (%), monthly average"),
    Series(series_id="USD_T10Y2Y", cid="USD", xcat="T10Y2Y", source="ALFRED_LATEST", source_series_id="T10Y2Y",
        regime="B", vintage_capable=False,
        attribution="Federal Reserve Bank of St. Louis, 10-Year Treasury Constant Maturity Minus 2-Year Treasury Constant Maturity [T10Y2Y], retrieved from FRED",
        frequency="D", description="US 10Y-2Y Treasury yield spread (%)"),

    # Second SOURCE (ECB euro FX) — Regime B (market rate, never revised), so the worker
    # sets vintage_date == observation_date. Licence GREEN WITH attribution (adversarially
    # verified; no service-layer ToS, unlike FRED) -> commercial_ok=True.
    Series(
        series_id="EUR_FXUSD", cid="EUR", xcat="FXUSD",
        source="ECB", source_series_id="USD",
        regime="B", vintage_capable=False,
        attribution="Source: European Central Bank",
        frequency="D", description="ECB euro reference rate: US dollars per euro (EUR/USD)",
    ),
    # Third SOURCE (Philadelphia Fed RTDS) — a FILE-based vintage source. Regime A (revisable),
    # vintage-capable. RTDS terms read first-party (2026-07): © Federal Reserve Bank of Philadelphia
    # (all rights reserved; a regional Reserve Bank is NOT a federal agency, so 17 USC §105 does not
    # apply) → display-RED + download-RED (research display only). NOT a download-GREEN off-FRED
    # vintage source. Verdicts assigned from `_LICENSE` below; see the sources-ledger.
    Series(
        series_id="USD_ROUTPUT", cid="USD", xcat="ROUTPUT",
        source="PHILLYFED", source_series_id="ROUTPUTQvQd",
        regime="A", vintage_capable=True,
        attribution="Source: Federal Reserve Bank of Philadelphia, Real-Time Data Set for Macroeconomists",
        frequency="Q",
        description="US real output (real GNP/GDP), Philadelphia Fed Real-Time Data Set, billions of real dollars, SA",
    ),
    # Same PHILLYFED fetcher, new file stems — broadens the GREEN vintage set (RUC + EMPLOY give the
    # Phillips-curve / business-cycle pairs the dashboard needs). Monthly obs; RUC = quarterly vintages,
    # EMPLOY = monthly vintages (the fetcher handles both).
    Series(
        series_id="USD_RUC", cid="USD", xcat="RUC",
        source="PHILLYFED", source_series_id="rucQvMd",
        regime="A", vintage_capable=True,
        attribution="Source: Federal Reserve Bank of Philadelphia, Real-Time Data Set for Macroeconomists",
        frequency="M",
        description="US civilian unemployment rate (%), Philadelphia Fed Real-Time Data Set (real-time vintages)",
    ),
    Series(
        series_id="USD_EMPLOY", cid="USD", xcat="EMPLOY",
        source="PHILLYFED", source_series_id="employMvMd",
        regime="A", vintage_capable=True,
        attribution="Source: Federal Reserve Bank of Philadelphia, Real-Time Data Set for Macroeconomists",
        frequency="M",
        description="US nonfarm payroll employment (thousands), Philadelphia Fed Real-Time Data Set (real-time vintages)",
    ),
]

# Which Fetcher handles which source. (The map is the extension seam — add a source here.)
FETCHERS = {
    "ALFRED": AlfredFetcher(),
    "ALFRED_LATEST": FredLatestFetcher(),  # non-revisable FRED series (rates) — current obs, no vintages
    "ECB": EcbFetcher(),
    "PHILLYFED": PhillyFedRtdsFetcher(),
}

# The JPMaQS-grammar QDF ticker per series, so our /api/v1/qdf output loads in the open `macrosynergy`
# package. Grammar = cid_BASE_ADJUSTMENT (their verified terms: cid, base, NSA/SA). We use PURE grammar
# (no transform suffix, no level marker) — a ticker with no transform IS the level, the honest way to say
# "raw level, transform it yourself". The bases are our OWN honest names IN their grammar (JPMaQS's exact
# bases are paywalled; we never guess them). T10Y2Y's `SPREAD` base is honest (it IS a derived spread).
QDF_TICKERS: dict[str, str] = {
    # Inflation
    "USD_CPIAUCSL": "USD_CPI_SA", "USD_CPILFESL": "USD_CPIC_SA", "USD_PCEPI": "USD_PCE_SA",
    "USD_PCEPILFE": "USD_PCEC_SA", "USD_PPIACO": "USD_PPI_NSA",
    # Labor
    "USD_UNRATE": "USD_UNEMPLRATE_SA", "USD_PAYEMS": "USD_EMPL_SA", "USD_CIVPART": "USD_LFPRATE_SA",
    "USD_ICSA": "USD_INITCLAIMS_SA", "USD_AHETPI": "USD_WAGE_SA", "USD_JTSJOL": "USD_JOBOPEN_SA",
    # Growth / activity
    "USD_GDPC1": "USD_RGDP_SA", "USD_INDPRO": "USD_IP_SA", "USD_RSAFS": "USD_RETAIL_SA",
    "USD_HOUST": "USD_HSTARTS_SA", "USD_DGORDER": "USD_DGORDERS_SA",
    # Philadelphia Fed RTDS (distinct bases from the ALFRED twins: ROUTPUT≠RGDP, RUCRATE≠UNEMPLRATE, EMPLOY≠EMPL)
    "USD_ROUTPUT": "USD_ROUTPUT_SA", "USD_RUC": "USD_RUCRATE_SA", "USD_EMPLOY": "USD_EMPLOY_SA",
    # Rates (market observables → NSA)
    "USD_DGS10": "USD_GB10YYLD_NSA", "USD_DGS2": "USD_GB02YYLD_NSA", "USD_DGS3MO": "USD_GB03MYLD_NSA",
    "USD_FEDFUNDS": "USD_FFRATE_NSA", "USD_T10Y2Y": "USD_GB10V02SPREAD_NSA",
    # FX
    "EUR_FXUSD": "EUR_FXUSD_NSA",
}

# The Data Products: the Fusion-style grouping layer (Catalog -> Data Product -> Dataset).
# Code-seeded + worker-upserted, exactly like the series catalog. `theme` is the tree facet.
DATA_PRODUCTS = [
    DataProduct(product_id="us-inflation", title="US Inflation", theme="Inflation", sort_order=1,
                description="US consumer & producer price indices — CPI, core CPI, PCE, core PCE, PPI."),
    DataProduct(product_id="us-labor", title="US Labor", theme="Labor", sort_order=2,
                description="US labor market — unemployment, payrolls, participation, claims, wages, openings."),
    DataProduct(product_id="us-growth", title="US Growth & Activity", theme="Growth", sort_order=3,
                description="US output & activity — GDP, industrial production, retail sales, housing, orders."),
    DataProduct(product_id="us-rates", title="US Rates", theme="Rates", sort_order=4,
                description="US Treasury yields, the federal funds rate, and the 10Y-2Y spread."),
    DataProduct(product_id="fx", title="FX", theme="FX", sort_order=5,
                description="Foreign-exchange reference rates."),
]

# xcat -> product_id. Mirrors the frontend's `categoryOf` (categories.ts) so the server-driven tree
# matches the grouping the UI already shows. An unmapped xcat stays ungrouped (product_id = None).
_XCAT_PRODUCT: dict[str, str] = {
    # Inflation
    "CPIAUCSL": "us-inflation", "CPILFESL": "us-inflation", "PCEPI": "us-inflation",
    "PCEPILFE": "us-inflation", "PPIACO": "us-inflation",
    # Labor
    "UNRATE": "us-labor", "PAYEMS": "us-labor", "CIVPART": "us-labor", "ICSA": "us-labor",
    "AHETPI": "us-labor", "JTSJOL": "us-labor", "RUC": "us-labor", "EMPLOY": "us-labor",
    # Growth / activity
    "GDPC1": "us-growth", "INDPRO": "us-growth", "RSAFS": "us-growth", "HOUST": "us-growth",
    "DGORDER": "us-growth", "ROUTPUT": "us-growth",
    # Rates
    "DGS10": "us-rates", "DGS2": "us-rates", "DGS3MO": "us-rates", "FEDFUNDS": "us-rates",
    "T10Y2Y": "us-rates",
    # FX
    "FXUSD": "fx",
}

# Ledger-verified per-SOURCE licence verdicts (see .claude/memory/sources-ledger.md):
#   (commercial_ok = cleared for commercial DISPLAY · downloadable = cleared to redistribute as a FILE)
#   ALFRED / ALFRED_LATEST — US-gov public-domain data (BLS/BEA/Census/Fed/Treasury, 17 USC §105); FRED
#     grants commercial display with attribution -> DISPLAY cleared. The FRED API ToS bars caching/
#     redistribution of the fetched file -> DOWNLOAD RED (a pre-public-commercial-deploy flag; ingest for
#     this non-commercial study project is defensible).
#   ECB — ESCB reuse policy permits reuse "irrespective of commercial use" -> DISPLAY + DOWNLOAD cleared.
#   PHILLYFED — RTDS is © Federal Reserve Bank of Philadelphia (all rights reserved; a regional Reserve
#     Bank is not a federal agency, so 17 USC §105 does NOT apply); no commercial/redistribution grant ->
#     DISPLAY RED (research display only) + DOWNLOAD RED.
_LICENSE: dict[str, tuple[bool, bool]] = {
    "ALFRED": (True, False),
    "ALFRED_LATEST": (True, False),
    "ECB": (True, True),
    "PHILLYFED": (False, False),
}

# The value's UNIT per series — taken from each series' own description (no invented magnitudes):
# price indices -> "index"; rates/spreads/participation/unemployment -> "%"; counts as described.
_UNIT: dict[str, str] = {
    "USD_CPIAUCSL": "index", "USD_CPILFESL": "index", "USD_PCEPI": "index", "USD_PCEPILFE": "index",
    "USD_PPIACO": "index", "USD_INDPRO": "index",
    "USD_UNRATE": "%", "USD_CIVPART": "%", "USD_RUC": "%",
    "USD_DGS10": "%", "USD_DGS2": "%", "USD_DGS3MO": "%", "USD_FEDFUNDS": "%", "USD_T10Y2Y": "%",
    "USD_PAYEMS": "thousands of persons", "USD_EMPLOY": "thousands of persons", "USD_JTSJOL": "thousands",
    "USD_ICSA": "count (claims), SA",
    "USD_AHETPI": "USD per hour",
    "USD_GDPC1": "chained 2017 dollars, annual rate",
    "USD_ROUTPUT": "billions of real dollars",
    "USD_RSAFS": "millions USD", "USD_DGORDER": "millions USD",
    "USD_HOUST": "thousands of units, SAAR",
    "EUR_FXUSD": "USD per EUR",
}

# Stamp each catalog row: QDF ticker (unmapped → None), Data Product (unmapped → None), the per-source
# display / redistribution licence verdicts, and the value's unit.
for _s in V1_SERIES:
    _s.qdf_ticker = QDF_TICKERS.get(_s.series_id)
    _s.product_id = _XCAT_PRODUCT.get(_s.xcat)
    _s.commercial_ok, _s.downloadable = _LICENSE[_s.source]
    _s.unit = _UNIT.get(_s.series_id)