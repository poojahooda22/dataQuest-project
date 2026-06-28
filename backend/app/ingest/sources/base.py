"""The Fetcher base class — the three-step TET interface every data source implements.

Clean-room: this is our own ~20-line base, reimplemented from the publicly-documented
TET (Transform -> Extract -> Transform) pattern. We vendor ZERO openbb-* code (it is
AGPL-licensed, which would force us to open-source everything).
"""

from app.ingest.standard import Provenance, QdfRow


class Fetcher:
    """One data source = one Fetcher with three clean steps that never cross jobs:

      1. transform_query  -> build the request   (params only, NO network)
      2. extract_data     -> do the fetch         (returns RAW data, NO shaping)
      3. transform_data   -> clean the raw data   (RAW -> QdfRows + Provenance, NO network)

    A subclass (e.g. AlfredFetcher) implements all three. Splitting them this way makes
    each step testable on its own, and makes a failure land in the step that caused it.
    """

    def transform_query(self, source_series_id: str) -> dict:
        raise NotImplementedError

    def extract_data(self, native: dict) -> list[dict]:
        raise NotImplementedError

    def transform_data(self, raw: list[dict]) -> tuple[list[QdfRow], Provenance]:
        raise NotImplementedError