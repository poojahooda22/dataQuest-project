"""Database engines + session dependencies.

TWO engines on purpose:
  - `engine` (SYNC): used by the off-request INGEST WORKER (load.py, run.py) and Alembic.
    A batch job gets no benefit from async, so it stays simple and synchronous.
  - `async_engine` (ASYNC): used by the READ API (the request path). Async lets one event
    loop serve many concurrent reads without a 40-thread ceiling. Uses the asyncpg driver
    (create_async_engine) — NOT psycopg-async, which can't run on Windows's ProactorEventLoop.

Both carry bounded timeouts so a dead/slow Postgres fails FAST (the 30s-hang fix) instead
of blocking. connect_timeout caps the TCP connect; pool_timeout caps the wait for a free
pooled connection; statement_timeout (read engine only) caps a single query.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import create_engine

from app.core.config import settings

# --- SYNC engine: the ingest worker + Alembic. No statement_timeout (a bulk load runs long). ---
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},  # fail fast if Postgres is down
)

# --- ASYNC engine: the read API request path. ---
# Uses asyncpg (not psycopg-async): psycopg's async mode can't run on Windows's default
# ProactorEventLoop, and asyncpg works on Windows + Linux. Same DSN, different driver.
_async_url = settings.database_url.replace("+psycopg", "+asyncpg")
async_engine = create_async_engine(
    _async_url,
    pool_pre_ping=True,
    pool_size=10,          # connections kept open
    max_overflow=20,       # extra connections allowed under burst
    pool_timeout=5,        # wait at most 5s for a free connection, then error
    pool_recycle=1800,     # drop connections older than 30 min
    connect_args={
        "timeout": 3,                                      # cap the connect (fixes the 30s hang)
        "command_timeout": 5,                              # client-side query timeout
        "server_settings": {"statement_timeout": "5000"},  # Postgres kills any read query > 5s
    },
)

AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Hand one async DB session to a read request; close it when the request ends."""
    async with AsyncSessionLocal() as session:
        yield session
