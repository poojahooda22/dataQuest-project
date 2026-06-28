"""Shared point-in-time SQL for the read API.

PIT_SQL (single series) and PIT_SQL_BULK (many series in ONE query) live here together so
the two read endpoints can never drift apart. Both bound the result with a date window
(:start/:end) and a hard :row_cap.
"""

from sqlalchemy import text

# Single series. For each observation_date, the newest value known by :as_of, within the
# [:start, :end] window. Verified no-Sort: EXPLAIN ANALYZE shows an Index Scan on ix_obs_pit
# (series_id, observation_date, vintage_date DESC) with no Sort step (checked Phase 3).
PIT_SQL = text(
    """
    SELECT DISTINCT ON (observation_date) observation_date, value, vintage_date
    FROM observation
    WHERE series_id = :series_id
      AND vintage_date <= :as_of
      AND observation_date BETWEEN :start AND :end
    ORDER BY observation_date, vintage_date DESC
    LIMIT :row_cap
    """
)

# Many series in ONE query (kills the per-ticker N+1 loop). :series_ids is bound as an array
# -> WHERE series_id = ANY(...). DISTINCT ON leads with series_id, matching ix_obs_pit, so it
# still walks the index without a Sort.
PIT_SQL_BULK = text(
    """
    SELECT DISTINCT ON (series_id, observation_date)
           series_id, observation_date, value, vintage_date
    FROM observation
    WHERE series_id = ANY(:series_ids)
      AND vintage_date <= :as_of
      AND observation_date BETWEEN :start AND :end
    ORDER BY series_id, observation_date, vintage_date DESC
    LIMIT :row_cap
    """
)