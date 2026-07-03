from datetime import date

from sqlmodel import Field, SQLModel


class DataProduct(SQLModel, table=True):
    """A Fusion-style DATA PRODUCT: a named grouping of related series.

    The grouping level of the ontology — Catalog -> Data Product -> Dataset (Series) -> Distribution.
    Code-seeded in the registry and worker-upserted, exactly like the series catalog.
    """

    product_id: str = Field(primary_key=True)   # slug, e.g. "us-inflation"
    title: str                                  # human label, e.g. "US Inflation"
    description: str = ""
    theme: str = ""                             # the asset-class/theme facet, e.g. "Inflation"
    sort_order: int = 0                         # display order in the product tree


class Series(SQLModel, table=True):
    """The CATALOG: one row per indicator."""

    series_id: str = Field(primary_key=True)  # cid_xcat ticker, e.g. "USD_CPIAUCSL"
    cid: str                                  # market / country, e.g. "USD"
    xcat: str                                 # indicator, e.g. "CPIAUCSL"
    source: str                               # "ALFRED"
    source_series_id: str                     # the upstream id, e.g. "CPIAUCSL"
    regime: str                               # "A" revisable | "B" market
    vintage_capable: bool = False
    commercial_ok: bool = False               # DISPLAY licence — cleared for commercial display (default FALSE)
    downloadable: bool = False                # REDISTRIBUTION gate — cleared to hand out as a file (default FALSE)
    attribution: str = ""                     # "Source: U.S. BLS via ALFRED"
    frequency: str = "M"
    description: str = ""
    unit: str | None = None  # the value's unit ("%", "index", "thousands of persons", ...); NULL = unstated
    qdf_ticker: str | None = None  # JPMaQS-grammar ticker (cid_BASE_ADJUSTMENT), e.g. "USD_CPI_SA"; NULL = not mapped
    product_id: str | None = Field(default=None, foreign_key="dataproduct.product_id", index=True)  # the Data Product this series belongs to; NULL = ungrouped


class Observation(SQLModel, table=True):
    """The VINTAGE PANEL: one row per information-state, append-only."""

    id: int | None = Field(default=None, primary_key=True)
    series_id: str = Field(foreign_key="series.series_id", index=True)
    observation_date: date                    # the period the value describes
    vintage_date: date                        # when the value was first known (= real_date)
    value: float
    # A hand-written migration adds, on top of these columns:
    #   UNIQUE (series_id, observation_date, vintage_date)         -> idempotent ON CONFLICT
    #   INDEX  (series_id, observation_date, vintage_date DESC)    -> the PIT index (R70 FIX #1)
    
    
    
    #on delete cascade -> foreign key is the connection between tables and let's say there are two tables one is user and other one is address, then if user is deleted then all address also delete that where this 
    #delete cascade command is used.
    
    #on delete restrict command -> here we can't delete the parent table without first delete its connects table.
    
    
    #Transactions -> this is important when we want to run 2 queries together, either queries run altogether or not, example payment let's suppose from one user want to deduct amount and from other add, so in this case transaction is safe query to use
    #Joins-> joining two tables data - example getting users all data users data like id, name, email and all address data, all data that is related to the particular user, in such case we use JOINS to connect two tables
    #it will create new table with both tables data
    
    #therer are four types of JOIN - INNER, LEFT, RIGHT, FULL
    #Inner - return rows when it has atleast one match in both tables and if there is no match the rows are returned
    #example for Inner join -> find all users with their address, and if a user hasn't filled address, that user shouldn't be returned.
    #left join- will return left table, even there is no listing on right table.
    #Example for Left join -> find all users with their address, and if a user hasn't filled address, that user should be returned with empty address.
    #right join -> will return right table, even there is no listing on left table.
    #Example for Right join -> find all users with their address, and if a user hasn't filled address, that user shouldn't be returned.
    #full join -> will return both tables, even there is no listing on left or right table.
    #Example for Full join -> find all users with their address, and if a user hasn't filled address, that user should be returned with empty address.


class IndexDefinition(SQLModel, table=True):
    """An INDEX RECIPE: the published, rules-as-data definition of one bond index.

    The benchmark-construction layer. Every construction rule is stored as DATA (the income screen,
    the face/maturity thresholds, the diversification-cap scheme) so the recipe is inspectable and
    version-stamped, not hidden in code. The worker's index engine reads this recipe to build a
    composition; the read API serves it to the Index Lab UI. Code-seeded + worker-upserted, exactly
    like the series catalog.
    """

    index_id: str = Field(primary_key=True)   # slug, e.g. "us-treasury", "em-composition"
    title: str                                # human label, e.g. "DataQuest US Treasury Index"
    description: str = ""
    family: str = ""                          # the benchmark family, e.g. "Treasury", "EMBI-class"
    universe: str = ""                        # what it covers, e.g. "US Treasuries", "EM Sovereigns"
    currency: str = "USD"

    # ── The construction RULES, as data — the transparency; version-stamped by `doc_version` ──
    income_ceiling_usd: float | None = None   # GNI-per-capita eligibility ceiling; NULL = no income screen
    min_face_usd_mn: float = 0.0              # min face outstanding to qualify (USD millions)
    min_maturity_years: float = 0.0          # min years to maturity AT ENTRY
    exit_maturity_months: float = 0.0        # drop a constituent once it falls below this many months
    cap_scheme: str = "none"                  # "ica" (diversification cap) | "none" (pure face weight)
    cap_pct: float | None = None              # explicit cap, e.g. 0.09 = 9%; NULL = pure ICA / uncapped
    rebalance_rule: str = "monthly_last_business_day"

    methodology_note: str = ""                # plain-language explanation + the rule source
    doc_version: str = ""                     # provenance of the parameters, e.g. "as of 2026-07"

    # DISPLAY licence for the index, rolled up from its input sources under the contamination rule
    # (GREEN only if EVERY input is GREEN). Assigned per index from the ledger, default-deny — like
    # the series catalog's `commercial_ok`.
    commercial_ok: bool = False
    attribution: str = ""
    sort_order: int = 0                       # display order in the Index Lab list


class IndexComposition(SQLModel, table=True):
    """The INDEX PANEL: one row per constituent, per rebalance, per vintage. Append-only.

    Each monthly rebalance produces a SET of constituents with weights; we store every set stamped
    with a `vintage_date` (when we computed it), so the composition is point-in-time — "what did the
    index look like as known on date X" — the same vintage discipline as the Observation panel. A
    recompute of a past rebalance (e.g. after an input revision) is a NEW vintage, never an overwrite.
    Ineligible constituents are kept (eligible=False) so the "how it's built" screen can show why.
    """

    id: int | None = Field(default=None, primary_key=True)
    index_id: str = Field(foreign_key="indexdefinition.index_id", index=True)
    rebalance_date: date                      # the month-end the composition is FOR (the effective date)
    vintage_date: date                        # when this composition was computed / first known (= real_date)
    constituent_id: str                       # the weighted item: a CUSIP (Treasury) or country code (EM)
    constituent_name: str = ""                # display label, e.g. "Mexico" or the security description
    cid: str = ""                             # market/country grouping code, mirrors Series.cid
    face_amount: float = 0.0                  # the size input (USD millions) — the raw-weight numerator
    raw_weight: float = 0.0                   # face / total eligible face, BEFORE the cap (0..1)
    capped_weight: float = 0.0                # weight AFTER the cap + redistribution (0..1)
    eligible: bool = True                     # did it pass the screen (ineligible rows kept for the audit)
    eligibility_reason: str = ""              # short human why-in / why-out, for the "how it's built" table
    # A hand-written migration adds, on top of these columns:
    #   UNIQUE (index_id, rebalance_date, vintage_date, constituent_id)  -> idempotent ON CONFLICT
    #   INDEX  (index_id, rebalance_date, vintage_date DESC)             -> the PIT index (mirrors ix_obs_pit)
