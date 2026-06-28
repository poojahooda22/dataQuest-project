"""The catalog seed + the {source -> Fetcher} map.

This is THE one extension point for new data: to add a series, add its catalog row here
(and a Fetcher for its source) and run the worker — the read API then serves it with zero
code change. A ticker is "available" only after its source has been ingested.
"""

from app.ingest.sources.alfred import AlfredFetcher, FredLatestFetcher
from app.ingest.sources.ecb import EcbFetcher
from app.ingest.sources.phillyfed import PhillyFedRtdsFetcher
from app.models import Series

# The v1 catalog. `commercial_ok` is a PER-SERIES verdict (never blanket-trust a source):
# the FRED/ALFRED series are display-GREEN but kept False pending a first-party FRED API
# ToS read (decision 0004); the ECB series is GREEN-with-attribution and verified clean of
# any service-layer ToS, so it is True. See .claude/memory/sources-ledger.md.
V1_SERIES = [
    Series(
        series_id="USD_CPIAUCSL",
        cid="USD",
        xcat="CPIAUCSL",
        source="ALFRED",
        source_series_id="CPIAUCSL",
        regime="A",  # revisable statistic -> needs vintages
        vintage_capable=True,
        commercial_ok=False,  # display is GREEN; gate stays false until the FRED API ToS is first-party verified
        attribution=(
            "U.S. Bureau of Labor Statistics, Consumer Price Index for All Urban "
            "Consumers: All Items [CPIAUCSL], retrieved from FRED, Federal Reserve "
            "Bank of St. Louis"
        ),
        frequency="M",
        description="US CPI, all items, seasonally adjusted",
    ),
    # More US indicators from the SAME ALFRED source — no new code, just catalog rows.
    # All US-gov public-domain (BLS/BEA), so commercial_ok stays False under the same
    # FRED-API-ToS caveat as CPI (see decision 0004 / the sources-ledger).
    Series(
        series_id="USD_UNRATE", cid="USD", xcat="UNRATE",
        source="ALFRED", source_series_id="UNRATE",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Bureau of Labor Statistics, Unemployment Rate [UNRATE], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US unemployment rate (U-3), seasonally adjusted",
    ),
    Series(
        series_id="USD_PAYEMS", cid="USD", xcat="PAYEMS",
        source="ALFRED", source_series_id="PAYEMS",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Bureau of Labor Statistics, All Employees: Total Nonfarm [PAYEMS], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US nonfarm payroll employment, SA (thousands of persons)",
    ),
    Series(
        series_id="USD_GDPC1", cid="USD", xcat="GDPC1",
        source="ALFRED", source_series_id="GDPC1",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Bureau of Economic Analysis, Real Gross Domestic Product [GDPC1], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="Q", description="US real GDP, SA annual rate (chained 2017 dollars)",
    ),

    # ── Catalog expansion — more US-gov public-domain series via the SAME ALFRED fetcher ──
    # All BLS / BEA / U.S. Census / Federal Reserve / U.S. Treasury / DOL underlying → 17 USC §105
    # public domain (display-GREEN); commercial_ok stays False under the FRED-API-ToS caveat
    # (decision 0004 / sources-ledger). Deliberately NO third-party FRED series (no CBOE/VIX,
    # S&P/DJ/Nasdaq, U-Michigan sentiment, Freddie-Mac PMMS) — FRED *hosting* ≠ public domain.

    # Inflation (BLS / BEA, revisable → regime A, vintage-capable)
    Series(series_id="USD_CPILFESL", cid="USD", xcat="CPILFESL", source="ALFRED", source_series_id="CPILFESL",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Bureau of Labor Statistics, Consumer Price Index for All Urban Consumers: All Items Less Food and Energy [CPILFESL], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US core CPI (all items less food & energy), SA"),
    Series(series_id="USD_PCEPI", cid="USD", xcat="PCEPI", source="ALFRED", source_series_id="PCEPI",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Bureau of Economic Analysis, Personal Consumption Expenditures: Chain-type Price Index [PCEPI], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US PCE price index, SA"),
    Series(series_id="USD_PCEPILFE", cid="USD", xcat="PCEPILFE", source="ALFRED", source_series_id="PCEPILFE",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Bureau of Economic Analysis, Personal Consumption Expenditures Excluding Food and Energy (Chain-Type Price Index) [PCEPILFE], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US core PCE price index (ex food & energy), SA"),
    Series(series_id="USD_PPIACO", cid="USD", xcat="PPIACO", source="ALFRED", source_series_id="PPIACO",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Bureau of Labor Statistics, Producer Price Index by Commodity: All Commodities [PPIACO], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US producer price index, all commodities"),

    # Labor (BLS / DOL, revisable → regime A)
    Series(series_id="USD_CIVPART", cid="USD", xcat="CIVPART", source="ALFRED", source_series_id="CIVPART",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Bureau of Labor Statistics, Labor Force Participation Rate [CIVPART], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US labor force participation rate (%), SA"),
    Series(series_id="USD_ICSA", cid="USD", xcat="ICSA", source="ALFRED", source_series_id="ICSA",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Employment and Training Administration, Initial Claims [ICSA], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="W", description="US initial jobless claims, SA"),
    Series(series_id="USD_AHETPI", cid="USD", xcat="AHETPI", source="ALFRED", source_series_id="AHETPI",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Bureau of Labor Statistics, Average Hourly Earnings of Production and Nonsupervisory Employees, Total Private [AHETPI], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US average hourly earnings, production & nonsupervisory, SA"),
    Series(series_id="USD_JTSJOL", cid="USD", xcat="JTSJOL", source="ALFRED", source_series_id="JTSJOL",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Bureau of Labor Statistics, Job Openings: Total Nonfarm [JTSJOL], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US job openings (JOLTS), total nonfarm, SA (thousands)"),

    # Growth / activity (Federal Reserve / BEA / Census, revisable → regime A)
    Series(series_id="USD_INDPRO", cid="USD", xcat="INDPRO", source="ALFRED", source_series_id="INDPRO",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="Board of Governors of the Federal Reserve System (US), Industrial Production: Total Index [INDPRO], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US industrial production index, SA"),
    Series(series_id="USD_RSAFS", cid="USD", xcat="RSAFS", source="ALFRED", source_series_id="RSAFS",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Census Bureau, Advance Retail Sales: Retail and Food Services, Total [RSAFS], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US advance retail & food services sales, SA (millions USD)"),
    Series(series_id="USD_HOUST", cid="USD", xcat="HOUST", source="ALFRED", source_series_id="HOUST",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Census Bureau, New Privately-Owned Housing Units Started: Total Units [HOUST], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US housing starts, total units, SAAR (thousands)"),
    Series(series_id="USD_DGORDER", cid="USD", xcat="DGORDER", source="ALFRED", source_series_id="DGORDER",
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="U.S. Census Bureau, Manufacturers' New Orders: Durable Goods [DGORDER], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US durable goods new orders, SA (millions USD)"),

    # Rates (U.S. Treasury / Federal Reserve H.15 — market observables, not revised → regime B)
    Series(series_id="USD_DGS10", cid="USD", xcat="DGS10", source="ALFRED_LATEST", source_series_id="DGS10",
        regime="B", vintage_capable=False, commercial_ok=False,
        attribution="Board of Governors of the Federal Reserve System (US), Market Yield on U.S. Treasury Securities at 10-Year Constant Maturity, Quoted on an Investment Basis [DGS10], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="D", description="US 10-year Treasury constant-maturity yield (%)"),
    Series(series_id="USD_DGS2", cid="USD", xcat="DGS2", source="ALFRED_LATEST", source_series_id="DGS2",
        regime="B", vintage_capable=False, commercial_ok=False,
        attribution="Board of Governors of the Federal Reserve System (US), Market Yield on U.S. Treasury Securities at 2-Year Constant Maturity, Quoted on an Investment Basis [DGS2], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="D", description="US 2-year Treasury constant-maturity yield (%)"),
    Series(series_id="USD_DGS3MO", cid="USD", xcat="DGS3MO", source="ALFRED_LATEST", source_series_id="DGS3MO",
        regime="B", vintage_capable=False, commercial_ok=False,
        attribution="Board of Governors of the Federal Reserve System (US), Market Yield on U.S. Treasury Securities at 3-Month Constant Maturity, Quoted on an Investment Basis [DGS3MO], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="D", description="US 3-month Treasury constant-maturity yield (%)"),
    Series(series_id="USD_FEDFUNDS", cid="USD", xcat="FEDFUNDS", source="ALFRED", source_series_id="FEDFUNDS",
        regime="B", vintage_capable=False, commercial_ok=False,
        attribution="Board of Governors of the Federal Reserve System (US), Federal Funds Effective Rate [FEDFUNDS], retrieved from FRED, Federal Reserve Bank of St. Louis",
        frequency="M", description="US federal funds effective rate (%), monthly average"),
    Series(series_id="USD_T10Y2Y", cid="USD", xcat="T10Y2Y", source="ALFRED_LATEST", source_series_id="T10Y2Y",
        regime="B", vintage_capable=False, commercial_ok=False,
        attribution="Federal Reserve Bank of St. Louis, 10-Year Treasury Constant Maturity Minus 2-Year Treasury Constant Maturity [T10Y2Y], retrieved from FRED",
        frequency="D", description="US 10Y-2Y Treasury yield spread (%)"),

    # Second SOURCE (ECB euro FX) — Regime B (market rate, never revised), so the worker
    # sets vintage_date == observation_date. Licence GREEN WITH attribution (adversarially
    # verified; no service-layer ToS, unlike FRED) -> commercial_ok=True.
    Series(
        series_id="EUR_FXUSD", cid="EUR", xcat="FXUSD",
        source="ECB", source_series_id="USD",
        regime="B", vintage_capable=False, commercial_ok=True,
        attribution="Source: European Central Bank",
        frequency="D", description="ECB euro reference rate: US dollars per euro (EUR/USD)",
    ),
    # Third SOURCE (Philadelphia Fed RTDS) — a FILE-based vintage source that AVOIDS the FRED API
    # ToS contract (the re-source decision: get the vintage moat off FRED). Regime A (revisable),
    # vintage-capable. commercial_ok stays False until the RTDS terms are first-party read + ledgered.
    Series(
        series_id="USD_ROUTPUT", cid="USD", xcat="ROUTPUT",
        source="PHILLYFED", source_series_id="ROUTPUTQvQd",
        regime="A", vintage_capable=True, commercial_ok=False,
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
        regime="A", vintage_capable=True, commercial_ok=False,
        attribution="Source: Federal Reserve Bank of Philadelphia, Real-Time Data Set for Macroeconomists",
        frequency="M",
        description="US civilian unemployment rate (%), Philadelphia Fed Real-Time Data Set (real-time vintages)",
    ),
    Series(
        series_id="USD_EMPLOY", cid="USD", xcat="EMPLOY",
        source="PHILLYFED", source_series_id="employMvMd",
        regime="A", vintage_capable=True, commercial_ok=False,
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