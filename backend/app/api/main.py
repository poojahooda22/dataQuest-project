"""The API router — gathers the route modules under the /api/v1 prefix."""

from fastapi import APIRouter, Depends

from app.api.routes import catalog, datasets, dcat, indices, observations, products, qdf, series
from app.core.ratelimit import rate_limit

# Rate-limit EVERY /api/v1 route (not /health). The dependency sets RateLimit-* headers and
# raises RateLimited (-> 429 problem+json) when a client IP exceeds the window.
api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(rate_limit)])
api_router.include_router(series.router)        # -> /api/v1/series/{ticker}
api_router.include_router(catalog.router)       # -> /api/v1/catalog, /catalog/{ticker}
api_router.include_router(products.router)      # -> /api/v1/products, /products/{id}
api_router.include_router(datasets.router)      # -> /api/v1/datasets/{ticker}/attributes (data dictionary)
api_router.include_router(dcat.router)          # -> /api/v1/catalog.jsonld (DCAT-v3 catalog export)
api_router.include_router(observations.router)  # -> /api/v1/observations
api_router.include_router(qdf.router)           # -> /api/v1/qdf (macrosynergy-loadable QDF)
api_router.include_router(indices.router)       # -> /api/v1/indices (Index Lab: list, detail, composition, changes)