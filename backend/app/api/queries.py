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

# The CHANGES feed: per series, the newest vintage (publication) date and how many new information-states
# arrived after :since. vintage_date IS the upstream publication event, so this reads "what the sources
# published recently" straight off the append-only store — no event table needed. Whole-table aggregate:
# fine at this scale (guarded by the read engine's statement_timeout); materialize/cron-warm at Tier 2.
CHANGES_SQL = text(
    """
    SELECT series_id,
           MAX(vintage_date) AS latest_vintage,
           COUNT(*) FILTER (WHERE vintage_date > :since) AS new_observations
    FROM observation
    GROUP BY series_id
    HAVING COUNT(*) FILTER (WHERE vintage_date > :since) > 0
    ORDER BY MAX(vintage_date) DESC
    LIMIT :row_cap
    """
)

# ALL vintages of a series (NOT point-in-time): the full revision history of every observation in the
# window, for the revision workbench (convergence curve + fixed-event track). There is NO
# `vintage_date <= as_of` filter — we want every information-state, not the one known on a date. Ordered
# (observation_date, vintage_date) so the read groups cleanly into each observation's release sequence
# (first print -> ... -> latest). Walks ix_obs_pit (series_id leads), bounded by :row_cap.
REVISIONS_SQL = text(
    """
    SELECT observation_date, vintage_date, value
    FROM observation
    WHERE series_id = :series_id
      AND observation_date BETWEEN :start AND :end
    ORDER BY observation_date, vintage_date
    LIMIT :row_cap
    """
)