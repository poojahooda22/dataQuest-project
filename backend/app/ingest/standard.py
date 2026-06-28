"""The standard output shape of the write-path: one normalized observation row,
plus the provenance stamp that travels with every fetched batch.

Every data source, no matter how messy its own format, must produce rows in THIS
shape from its `transform_data` step. That uniformity is what lets the rest of the
system stay ignorant of where data came from.
"""

from dataclasses import dataclass
from datetime import date, datetime

from pydantic import BaseModel


class QdfRow(BaseModel):
    """One normalized observation, IN MEMORY, before it is written to the database.

    Note what it does NOT have: no `id`, no `series_id`. Those belong to the database
    table (app/models.py `Observation`); they are attached at load time. This class is
    the "data in flight"; the table is the "data at rest".

    Being a Pydantic BaseModel means it VALIDATES and COERCES on creation — e.g. it
    turns the string "2014-03-01" into a real `date`, and rejects anything that isn't.
    """

    observation_date: date  # the period the value describes
    vintage_date: date      # the date this value first became known (= real_date)
    value: float


@dataclass
class Provenance:
    """The 'where did this come from' stamp attached to every fetched batch.

    The write-path CARRIES this verdict; it never invents it. `commercial_ok` comes
    from the sources-ledger and defaults to False until a GREEN fetch path is confirmed.

    (A plain dataclass, not a Pydantic model, because we fill every field ourselves —
    there's no untrusted external input here to validate.)
    """

    source: str                  # e.g. "ALFRED"
    fetched_at: datetime         # when we fetched it (UTC)
    commercial_ok: bool = False  # licence gate — default FALSE
    attribution: str = ""        # e.g. "Source: U.S. BLS via ALFRED"
    scale_note: str = "native units, no scaling applied"  # record any unit/scale conversion