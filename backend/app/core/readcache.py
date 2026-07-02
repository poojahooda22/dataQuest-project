"""In-process read cache + startup prewarm — compute-once-serve-many for the hot read endpoints.

The store's data changes ONLY when the ingest worker runs (at most daily), so identical GET requests
recompute identical JSON on every call — pure waste on a 0.25-vCPU container. This middleware caches the
FINAL response bytes per (path + query) for a short TTL and serves repeats from memory, collapsing
server time to ~a dict lookup. The prewarm task issues the dashboard's exact request set against the app
itself at startup (in-process ASGI — no sockets, no upstream fetch; read-never-fetches holds), so even
the FIRST visitor gets cache hits.

Bounds (charter: a cache without eviction is a leak): TTL 15 min, ≤256 entries (FIFO evict), ≤2 MB/body,
GET-only, 200-only, hot read paths only; the CSV download is excluded (licence-gated, cheap enough).
Cache HITS bypass the rate-limit dependency (they cost ~nothing to serve); misses still pass through it.
"""

import asyncio
import logging
import time
from datetime import date

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("dataquest.readcache")

_CACHEABLE_PREFIXES = (
    "/api/v1/catalog",
    "/api/v1/observations",
    "/api/v1/series",
    "/api/v1/products",
    "/api/v1/datasets",
)
_EXCLUDE_SUBSTRINGS = ("/download.csv",)
_TTL_SECONDS = 15 * 60
_MAX_ENTRIES = 256
_MAX_BODY_BYTES = 2_000_000


class ReadCacheMiddleware(BaseHTTPMiddleware):
    def __init__(self, app) -> None:
        super().__init__(app)
        # key -> (expires_monotonic, media_type, body)
        self._store: dict[str, tuple[float, str, bytes]] = {}

    def _cacheable(self, request: Request) -> bool:
        if request.method != "GET":
            return False
        path = request.url.path
        if not path.startswith(_CACHEABLE_PREFIXES):
            return False
        return not any(s in path for s in _EXCLUDE_SUBSTRINGS)

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self._cacheable(request):
            return await call_next(request)

        key = f"{request.url.path}?{request.url.query}"
        now = time.monotonic()
        hit = self._store.get(key)
        if hit and hit[0] > now:
            _, media_type, body = hit
            return Response(content=body, status_code=200, media_type=media_type,
                            headers={"x-cache": "hit"})

        response = await call_next(request)
        if response.status_code != 200:
            return response

        # Buffer the streamed body once so it can be stored AND returned.
        chunks = [chunk async for chunk in response.body_iterator]  # type: ignore[attr-defined]
        body = b"".join(chunks)
        media_type = response.headers.get("content-type", "application/json")
        if len(body) <= _MAX_BODY_BYTES:
            if len(self._store) >= _MAX_ENTRIES:  # FIFO eviction — oldest insertion out
                self._store.pop(next(iter(self._store)), None)
            self._store[key] = (now + _TTL_SECONDS, media_type, body)
        headers = {k: v for k, v in response.headers.items()
                   if k.lower() not in ("content-length", "content-encoding")}
        headers["x-cache"] = "miss"
        return Response(content=body, status_code=200, media_type=media_type, headers=headers)


def _home_page_urls() -> list[str]:
    """The dashboard's exact first-load request set (kept in step with the frontend's date math)."""
    from app.ingest.registry import V1_SERIES  # local import: registry is cheap, but keep startup lean

    today = date.today()
    def years_ago(n: int) -> str:
        return today.replace(year=today.year - n).isoformat()

    tickers = "&".join(f"tickers={s.series_id}" for s in V1_SERIES)
    urls = [
        "/api/v1/catalog?limit=200&offset=0",
        f"/api/v1/observations?{tickers}&start={(today.replace(year=today.year - 2)).isoformat()}",
        f"/api/v1/observations?{tickers}&start={years_ago(1)}",
        "/api/v1/products",
        "/api/v1/catalog/changes?limit=8",
        "/api/v1/catalog/reliability",
    ]
    for hero in ("USD_CPIAUCSL", "USD_GDPC1", "USD_INDPRO", "USD_PAYEMS"):
        for n in (1, 5, 10):
            urls.append(f"/api/v1/series/{hero}?start={years_ago(n)}")
    return urls


async def prewarm(app) -> None:
    """Fire the home-page request set through the app IN-PROCESS so the cache is hot before the first
    visitor. Failures are logged and skipped — prewarm must never take the service down."""
    import httpx

    await asyncio.sleep(1)  # let the pool/lifespan settle
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://prewarm") as client:
        for url in _home_page_urls():
            try:
                r = await client.get(url)
                logger.info("prewarm %s -> %s", url.split("?")[0], r.status_code)
            except Exception as exc:  # noqa: BLE001 — a failed warm is a log line, never an outage
                logger.warning("prewarm failed %s: %s", url.split("?")[0], exc)
