from datetime import date

from sqlmodel import Field, SQLModel


class Series(SQLModel, table=True):
    """The CATALOG: one row per indicator."""

    series_id: str = Field(primary_key=True)  # cid_xcat ticker, e.g. "USD_CPIAUCSL"
    cid: str                                  # market / country, e.g. "USD"
    xcat: str                                 # indicator, e.g. "CPIAUCSL"
    source: str                               # "ALFRED"
    source_series_id: str                     # the upstream id, e.g. "CPIAUCSL"
    regime: str                               # "A" revisable | "B" market
    vintage_capable: bool = False
    commercial_ok: bool = False               # licence gate — default FALSE (provenance NN2)
    attribution: str = ""                     # "Source: U.S. BLS via ALFRED"
    frequency: str = "M"
    description: str = ""


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
    