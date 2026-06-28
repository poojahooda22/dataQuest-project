"""The ingest write-path: the ONLY code allowed to fetch upstream.

TET fetchers (sources/) + the loader + the worker entrypoint live here. Nothing
under app/api/ may import from this package — read never fetches.
"""
