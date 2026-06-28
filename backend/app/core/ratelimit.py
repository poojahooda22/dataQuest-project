"""In-memory IP sliding-window rate limiter (v1, single Fly process).

The public read API has no viewer auth, so this is its abuse/cost shield: each client IP gets
`rate_limit_requests` per `rate_limit_window_seconds`; over that -> 429 with `Retry-After` +
`RateLimit-*` headers so well-behaved clients self-regulate. It is a FastAPI dependency, so an
over-limit raises `RateLimited` -> the one RFC-9457 problem+json envelope.

Two corrections from the R70 review are baked in:
  - IPv6 is aggregated by **/64** (an attacker owns a whole /64; a /128 limit is trivially rotated).
  - the real client IP is read from Fly's `Fly-Client-IP` (the socket peer is Fly's proxy).

Single-process, in-memory: correct for ONE Fly machine. Multiple replicas need a shared store
(Redis); that is the documented upgrade — stated, not hidden. The per-request COST is separately
capped by `max_points`/LTTB + the 50k row cap (see downsample.py / the routes).
"""

import ipaddress
import time
from collections import defaultdict, deque

from fastapi import Request, Response

from app.core.config import settings
from app.core.errors import RateLimited

_hits: dict[str, deque[float]] = defaultdict(deque)
_last_sweep = time.monotonic()


def _client_key(request: Request) -> str:
    """The rate-limit key: the true client IP (behind Fly's proxy), IPv6 collapsed to its /64."""
    raw = request.headers.get("fly-client-ip")
    if not raw:
        xff = request.headers.get("x-forwarded-for")
        raw = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "unknown")
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError:
        return raw  # unparseable -> key by the raw string (still bounded)
    if ip.version == 6:
        return str(ipaddress.ip_network(f"{ip}/64", strict=False).network_address)
    return str(ip)


def _sweep(now: float, window: float) -> None:
    """Drop keys whose window has fully expired so the dict can't grow unbounded (memory guard)."""
    global _last_sweep
    if now - _last_sweep < window:
        return
    _last_sweep = now
    for key in [k for k, dq in _hits.items() if not dq or dq[-1] <= now - window]:
        del _hits[key]


async def rate_limit(request: Request, response: Response) -> None:
    """FastAPI dependency: enforce the per-IP sliding window; set RateLimit-* headers; 429 on over."""
    limit = settings.rate_limit_requests
    window = float(settings.rate_limit_window_seconds)
    now = time.monotonic()
    _sweep(now, window)
    dq = _hits[_client_key(request)]
    while dq and dq[0] <= now - window:  # evict timestamps outside the window
        dq.popleft()
    remaining = max(0, limit - len(dq))
    rl_headers = {
        "RateLimit-Limit": str(limit),
        "RateLimit-Remaining": str(remaining),
        "RateLimit-Reset": str(int(window)),
    }
    # Informational headers on success (clients self-regulate before hitting the wall).
    for name, value in rl_headers.items():
        response.headers[name] = value
    if len(dq) >= limit:
        retry_after = int(window - (now - dq[0])) + 1
        # On the 429, carry the same RateLimit-* (set to remaining=0) through the problem envelope.
        raise RateLimited(retry_after=retry_after, headers={**rl_headers, "RateLimit-Remaining": "0"})
    dq.append(now)