"""Typed errors for the write-path.

These exist to uphold rule #1 — never invent a number. A failed, empty, or
unauthorized fetch raises one of these, and the worker SKIPS that series (keeping
whatever it already had) instead of storing a fabricated or zero value.
"""


class EmptyData(Exception):
    """Upstream returned no usable data -> skip the series, never zero-fill."""


class Unavailable(Exception):
    """The fetch itself failed: network error, bad HTTP status, or over budget."""


class NeedsKey(Exception):
    """A required credential (e.g. FRED_API_KEY) is missing."""