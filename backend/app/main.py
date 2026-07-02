import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.core.errors import register_error_handlers, register_problem_openapi
from app.core.logging import CorrelationIdMiddleware
from app.core.readcache import ReadCacheMiddleware, prewarm


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm the read cache with the dashboard's first-load request set (in-process, off the request
    # path, non-blocking) so the FIRST visitor after a deploy gets memory-speed responses.
    warm_task = asyncio.create_task(prewarm(app))
    yield
    warm_task.cancel()


api = FastAPI(title="DataQuest API", version="0.1.0", lifespan=lifespan)
# Middleware stack (add_middleware = last-added is OUTERMOST):
#   ReadCache (innermost) caches the raw JSON per path+query -> CORS stamps the origin header ->
#   GZip (outermost) compresses per-request per Accept-Encoding, hits and misses alike.
api.add_middleware(ReadCacheMiddleware)
# CORS: let the dashboard's browser origin read the API. Public, credential-less (auth deferred),
# so "*" is acceptable; lock to the dashboard origin via CORS_ORIGINS per deploy.
api.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)
# 305KB of repetitive JSON compresses ~10:1 — the transfer-time half of the latency baseline.
api.add_middleware(GZipMiddleware, minimum_size=1024)
register_error_handlers(api)  # ALL errors funnel through one RFC-9457 problem+json shape
api.include_router(api_router)
register_problem_openapi(api)  # /openapi.json + /docs advertise the real problem+json error shape


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Correlation-id wraps the whole app from OUTSIDE so even a worst-case 500 carries the header.
app = CorrelationIdMiddleware(api)
