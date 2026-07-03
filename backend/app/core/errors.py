"""RFC-9457 problem+json — ONE error shape for the whole read API.

Every 4xx/5xx funnels through `problem_response()` into an `application/problem+json`
body with the five standard members (type, title, status, detail, instance). Rules:
  - **No leak.** A 500 body has no class name / traceback / SQL / path. The catch-all logs
    the full detail server-side (keyed by the correlation id) and returns an OPAQUE body
    (RFC 9457 §5).
  - **Status parity.** The body `status` is the SAME variable as the HTTP status code.
  - **Stable typed `type`.** Every modeled failure has a dereferenceable type URI so a
    consumer can branch on it; the SAME logical failure returns the SAME type on every route.

Frontend analogy: one agreed `{ error: { type, title, detail } }` shape across the whole
API, so a client writes error handling once.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as SQLTimeoutError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("dataquest.errors")

PROBLEM_MEDIA_TYPE = "application/problem+json"
_TYPE_BASE = "https://errors.dataquest.dev/"


@dataclass
class DomainError(Exception):
    """Base for every MODELED, expected failure on the read path. Carries exactly the
    fields the problem envelope needs; subclasses below are the closed set of failures.
    `headers` lets a failure attach required response headers (e.g. Retry-After on 429/503)."""

    status: int = 500
    type_uri: str = "internal-error"
    title: str = "Internal error"
    detail: str = "An error occurred."
    extras: dict[str, Any] = field(default_factory=dict)
    headers: dict[str, str] | None = None

    def __post_init__(self) -> None:
        super().__init__(self.detail)


# --- the closed set of modeled failures (one stable type URI per logical failure) ---
class CatalogNotFound(DomainError):
    def __init__(self, series_id: str) -> None:
        super().__init__(404, "catalog-not-found", "Catalog entry not found",
                         f"No series '{series_id}' in the catalog.")


class ProductNotFound(DomainError):
    def __init__(self, product_id: str) -> None:
        super().__init__(404, "product-not-found", "Data product not found",
                         f"No data product '{product_id}' in the catalog.")


class SeriesDataNotFound(DomainError):
    def __init__(self, series_id: str, as_of: object) -> None:
        super().__init__(404, "series-data-not-found", "No data for series at that vintage",
                         f"No data for '{series_id}' as of {as_of}.")


class IndexNotFound(DomainError):
    def __init__(self, index_id: str) -> None:
        super().__init__(404, "index-not-found", "Index not found",
                         f"No index '{index_id}' in the catalog.")


class IndexDataNotFound(DomainError):
    def __init__(self, index_id: str, as_of: object) -> None:
        super().__init__(404, "index-data-not-found", "No composition for index at that vintage",
                         f"No composition for '{index_id}' as of {as_of}.")


class ResultTooLarge(DomainError):
    def __init__(self, max_rows: int) -> None:
        super().__init__(422, "result-too-large", "Result set too large",
                         f"Result exceeds {max_rows} rows; narrow start/end.",
                         extras={"max_rows": max_rows})


class InvalidRequest(DomainError):
    def __init__(self, detail: str) -> None:
        super().__init__(422, "invalid-request", "Invalid request", detail)


class SeriesLicensingGated(DomainError):
    def __init__(self, series_id: str) -> None:
        super().__init__(403, "series-licensing-gated",
                         "Series not licensed for this surface",
                         f"'{series_id}' is not cleared for commercial display.")


class DownloadNotLicensed(DomainError):
    def __init__(self, series_id: str) -> None:
        super().__init__(403, "download-not-licensed",
                         "Series not licensed for file download",
                         f"'{series_id}' is view/query only — the source licence does not permit "
                         "redistributing it as a file. Query it via the JSON API instead.")


class UpstreamUnavailable(DomainError):
    def __init__(self, source: str) -> None:
        super().__init__(503, "upstream-unavailable",
                         "Upstream data source unavailable",
                         f"No fresh value from {source}.", headers={"Retry-After": "5"})


class RateLimited(DomainError):
    def __init__(self, retry_after: int = 5, headers: dict[str, str] | None = None) -> None:
        hdrs = {"Retry-After": str(retry_after), **(headers or {})}
        super().__init__(429, "rate-limited", "Rate limit exceeded",
                         "Too many requests; slow down.", headers=hdrs)


def problem_response(
    request: Request,
    *,
    status: int,
    type_uri: str = "about:blank",
    title: str = "Error",
    detail: str = "An error occurred.",
    extras: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """The ONE serializer every handler calls — guarantees a single shape.

    `about:blank` stays bare (RFC default); any other type_uri resolves under our docs host.
    `status` is reused as the body member AND the HTTP code. An `extras` key can never clobber
    a core member. `headers` forwards required response headers (Allow / Retry-After / ...).
    The X-Correlation-ID header is owned by the outer CorrelationIdMiddleware, not set here.
    """
    cid = getattr(request.state, "correlation_id", None)
    body: dict[str, Any] = {
        "type": type_uri if type_uri == "about:blank" else f"{_TYPE_BASE}{type_uri}",
        "title": title,
        "status": status,
        "detail": detail,
        "instance": request.url.path,
    }
    if cid:
        body["correlation_id"] = cid
    for key, value in (extras or {}).items():
        body.setdefault(key, value)
    return JSONResponse(
        status_code=status, content=body, media_type=PROBLEM_MEDIA_TYPE, headers=headers or None
    )


def register_error_handlers(app: FastAPI) -> None:
    """Register every handler so ALL errors funnel through `problem_response()`.

    Two layers do the catching (Starlette): the MODELED errors below (DomainError,
    HTTPException, RequestValidationError, the DB connectivity classes) are caught by the
    inner ExceptionMiddleware via an MRO walk over its handler dict; the bare-`Exception`
    catch-all is installed into the OUTER ServerErrorMiddleware and fires only for exceptions
    no inner handler matched. They live in different layers — there is no same-layer contest.
    """

    async def _domain(request: Request, exc: DomainError) -> JSONResponse:
        return problem_response(request, status=exc.status, type_uri=exc.type_uri,
                                title=exc.title, detail=exc.detail, extras=exc.extras,
                                headers=exc.headers)

    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        # Keyed on STARLETTE's HTTPException so we catch BOTH our raises (subclass) AND the
        # framework's own (404, 405, ...). Forward exc.headers so a framework 405 keeps its
        # mandatory `Allow` header (RFC 9110 §15.5.6), a 401 its WWW-Authenticate, etc.
        return problem_response(
            request, status=exc.status_code, title="Request failed",
            detail=exc.detail if isinstance(exc.detail, str) else "Request failed.",
            headers=getattr(exc, "headers", None))

    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Build the safe triple FROM RAW errors() FIRST, then encode only that projection.
        # Never run jsonable_encoder over the raw list: its `input`/`ctx` can be
        # non-serializable (raw bytes, a ValueError) and would raise INSIDE this handler,
        # turning a 422 into a 500. `input` is also dropped (it echoes the raw client value).
        errors = [{"type": e["type"], "loc": list(e["loc"]), "msg": e["msg"]}
                  for e in exc.errors()]
        return problem_response(
            request, status=422, type_uri="validation-error",
            title="Request validation failed",
            detail="One or more request parameters are invalid.",
            extras={"errors": jsonable_encoder(errors)})

    async def _db_unavailable(request: Request, exc: Exception) -> JSONResponse:
        # Connectivity/timeout DB failures -> retryable 503, not a 500. Covers OperationalError
        # (connect fail / server-side statement_timeout), InterfaceError (connection dropped — a
        # SIBLING, not a subclass), pool TimeoutError (pool exhaustion under a read spike), AND the
        # builtin TimeoutError that asyncpg's client-side command_timeout raises (SQLAlchemy does
        # NOT wrap it, so it would otherwise escape to the 500 catch-all).
        logger.warning("database unavailable: %s", type(exc).__name__)
        return problem_response(
            request, status=503, type_uri="upstream-unavailable",
            title="Database temporarily unavailable",
            detail="The data store is temporarily unavailable. Retry shortly.",
            headers={"Retry-After": "5"})

    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Log the FULL detail (class, message, traceback) server-side, keyed by the
        # correlation id; return an OPAQUE body (no class, no stack, no SQL) — RFC 9457 §5.
        cid = getattr(request.state, "correlation_id", None)
        logger.exception("unhandled exception",
                         extra={"correlation_id": cid, "path": request.url.path})
        return problem_response(
            request, status=500, type_uri="internal-error",
            title="Internal server error",
            detail="An unexpected error occurred. Quote the correlation id when reporting it.")

    app.add_exception_handler(DomainError, _domain)
    app.add_exception_handler(StarletteHTTPException, _http)
    app.add_exception_handler(RequestValidationError, _validation)
    app.add_exception_handler(OperationalError, _db_unavailable)
    app.add_exception_handler(InterfaceError, _db_unavailable)
    app.add_exception_handler(SQLTimeoutError, _db_unavailable)   # pool-checkout timeout
    # NOTE: this catches ANY builtin/asyncio TimeoutError -> 503. Safe ONLY while the read path has
    # no non-DB I/O (read-never-fetches): asyncpg connect/command_timeout is the sole source today.
    # If outbound I/O is ever added to a route, narrow this to the DB boundary so a non-DB timeout
    # isn't mislabeled "database unavailable".
    app.add_exception_handler(TimeoutError, _db_unavailable)      # asyncpg command_timeout (raw builtin)
    app.add_exception_handler(Exception, _unhandled)


# --- C10: make the emitted OpenAPI doc match the RUNTIME error shape ----------------------
class Problem(BaseModel):
    """The RFC-9457 problem+json body — documents error responses in OpenAPI/Swagger."""

    type: str = "about:blank"
    title: str
    status: int
    detail: str
    instance: str | None = None
    correlation_id: str | None = None


class ValidationProblem(Problem):
    """A 422 problem — adds the field-level `errors` list (type/loc/msg per bad field)."""

    errors: list[dict[str, Any]]


def register_problem_openapi(app: FastAPI) -> None:
    """Override `app.openapi()` so `/openapi.json` (and `/docs`) tell the truth: every 422 is
    `application/problem+json` (our `ValidationProblem`), NOT FastAPI's default
    `HTTPValidationError` array. Wraps FastAPI's own generator and patches its output ONCE
    (cached on `app.openapi_schema`). Without this, generated SDKs would build a 422 model the
    runtime never returns. Call AFTER `include_router` so all routes are present."""
    _default_openapi = app.openapi

    def _patched_openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema
        schema = _default_openapi()  # FastAPI's full OpenAPI 3.1 doc (also caches it)
        schemas = schema.setdefault("components", {}).setdefault("schemas", {})
        schemas["Problem"] = Problem.model_json_schema()
        schemas["ValidationProblem"] = ValidationProblem.model_json_schema()
        for path_item in schema.get("paths", {}).values():
            for operation in path_item.values():
                if not isinstance(operation, dict):
                    continue
                response_422 = operation.get("responses", {}).get("422")
                if response_422 is not None:
                    response_422["description"] = "Request validation failed"
                    response_422["content"] = {
                        PROBLEM_MEDIA_TYPE: {
                            "schema": {"$ref": "#/components/schemas/ValidationProblem"}
                        }
                    }
        app.openapi_schema = schema
        return schema

    app.openapi = _patched_openapi
