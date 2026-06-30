"""The API router — gathers the route modules under the /api/v1 prefix."""

from fastapi import APIRouter, Depends

from app.api.routes import catalog, observations, qdf, series
from app.core.ratelimit import rate_limit

# Rate-limit EVERY /api/v1 route (not /health). The dependency sets RateLimit-* headers and
# raises RateLimited (-> 429 problem+json) when a client IP exceeds the window.
api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(rate_limit)])
api_router.include_router(series.router)        # -> /api/v1/series/{ticker}
api_router.include_router(catalog.router)       # -> /api/v1/catalog, /catalog/{ticker}
api_router.include_router(observations.router)  # -> /api/v1/observations
api_router.include_router(qdf.router)           # -> /api/v1/qdf (macrosynergy-loadable QDF)