"""Server-side LTTB downsampling for chart-facing reads.

The load-bearing rule: **the API never returns more points than the chart can draw.** When a
request sets `max_points` (the panel's pixel width), the series is reduced to <= that many points
by **LTTB** (Largest-Triangle-Three-Buckets, Steinarsson 2013) — which preserves visual SHAPE
(peaks and troughs survive), unlike a naive every-Nth or average that would flatten spikes. The
first and last points are always kept.

Runs in the app layer over the already-bounded PIT result (plain-Postgres macro panel —
decision 0002). A SQL `lttb()` / continuous-aggregate path is the 10,000x upgrade for daily
market data, not needed at the macro-panel tier.
"""

from collections.abc import Sequence


def lttb_indices(xs: Sequence[float], ys: Sequence[float], threshold: int) -> list[int]:
    """Return the indices LTTB selects to reduce a series to ~`threshold` points.

    `xs` must be monotonic (the series is ordered by observation_date). Returns all indices
    unchanged when the series already fits or is too small to form triangles (< 3 points).
    """
    n = len(xs)
    if threshold >= n or threshold < 3:
        return list(range(n))
    bucket_size = (n - 2) / (threshold - 2)
    indices = [0]  # always keep the first point
    a = 0          # index of the last point we selected (one triangle vertex)
    for i in range(threshold - 2):
        # current bucket [start, end): the candidate points for this output slot
        start = int(i * bucket_size) + 1
        end = int((i + 1) * bucket_size) + 1
        # the NEXT bucket's average point is the triangle's third vertex
        next_start = end
        next_end = min(int((i + 2) * bucket_size) + 1, n)
        if next_start >= next_end:  # last bucket -> use the final point as the third vertex
            avg_x, avg_y = float(xs[n - 1]), float(ys[n - 1])
        else:
            span = next_end - next_start
            avg_x = sum(xs[next_start:next_end]) / span
            avg_y = sum(ys[next_start:next_end]) / span
        # pick the candidate forming the largest triangle with the last-selected point and the avg
        ax, ay = float(xs[a]), float(ys[a])
        best_area, best = -1.0, start
        for j in range(start, min(end, n)):
            area = abs((ax - avg_x) * (ys[j] - ay) - (ax - xs[j]) * (avg_y - ay))
            if area > best_area:
                best_area, best = area, j
        indices.append(best)
        a = best
    indices.append(n - 1)  # always keep the last point
    return indices


def downsample_rows(rows: Sequence, max_points: int) -> list:
    """Reduce ONE series' rows to <= `max_points` via LTTB (no-op if already small enough).

    Each row must carry `.observation_date` (a `date`) and `.value`. x = the date's ordinal,
    y = the value. Returns a subset of the original rows (their other fields are preserved).
    """
    if max_points >= len(rows) or len(rows) < 3:
        return list(rows)
    xs = [r.observation_date.toordinal() for r in rows]
    ys = [float(r.value) for r in rows]
    return [rows[i] for i in lttb_indices(xs, ys, max_points)]