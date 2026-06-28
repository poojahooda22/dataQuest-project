from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.core.errors import register_error_handlers, register_problem_openapi
from app.core.logging import CorrelationIdMiddleware

api = FastAPI(title="DataQuest API", version="0.1.0")
# CORS: let the dashboard's browser origin read the API. Public, credential-less (auth deferred),
# so "*" is acceptable; lock to the dashboard origin via CORS_ORIGINS per deploy.
api.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)
register_error_handlers(api)  # ALL errors funnel through one RFC-9457 problem+json shape
api.include_router(api_router)
register_problem_openapi(api)  # /openapi.json + /docs advertise the real problem+json error shape


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Correlation-id wraps the whole app from OUTSIDE so even a worst-case 500 carries the header.
app = CorrelationIdMiddleware(api)
