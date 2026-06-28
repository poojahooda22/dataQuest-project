# syntax=docker/dockerfile:1.7
# Multi-stage uv build for the DataQuest read API (FastAPI/Uvicorn), shipped to Fly.io.
# Pattern: astral-sh/uv-docker-example multistage — deps-layer cached, uv only in the builder,
# bytecode pre-compiled for fast cold start, non-root, single process, exec-form CMD.

# ============================================================================
# STAGE 1 — builder: has uv, builds the virtualenv, then is discarded.
# ============================================================================
FROM python:3.12-slim-trixie AS builder

# uv as a pinned static binary (never :latest / curl|sh / pip install uv).
COPY --from=ghcr.io/astral-sh/uv:0.11.24 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1 \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# STEP 1 — install ONLY dependencies (cached; invalidated only when the lock inputs change).
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

# STEP 2 — copy the source and install the project itself (cheap; re-runs on every code change).
COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked

# ============================================================================
# STAGE 2 — runtime: NO uv, just the venv + source. Same Python image as builder.
# ============================================================================
FROM python:3.12-slim-trixie

RUN groupadd --system --gid 999 nonroot \
 && useradd  --system --gid 999 --uid 999 --create-home nonroot

COPY --from=builder --chown=nonroot:nonroot /app /app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER nonroot
WORKDIR /app

EXPOSE 8080

# Single Uvicorn process (Fly scales by machines, never --workers). Exec form -> PID 1 receives
# SIGTERM -> graceful drain + lifespan shutdown. `app.main:app` is the correlation-id-wrapped ASGI app.
# --timeout-graceful-shutdown 25 < fly.toml kill_timeout 30s (drain finishes before Fly SIGKILLs).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--timeout-graceful-shutdown", "25"]