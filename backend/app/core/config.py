from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # The local default matches compose.yml's credentials so Phase 1 works with no
    # .env file. In production, the DATABASE_URL environment variable overrides it.
    database_url: str = "postgresql+psycopg://dataquest:dataquest@localhost:5432/dataquest"
    fred_api_key: str = ""  # set in backend/.env as FRED_API_KEY=... (used by the worker in Phase 2)

    # --- 6C: open-API protection (no viewer auth; public read) ---
    # IP sliding-window rate limit: this many requests per window per client IP (IPv6 by /64).
    rate_limit_requests: int = 120
    rate_limit_window_seconds: int = 60
    # CORS: which browser origins may call the API. "*" is fine for a public, credential-less read
    # API (no cookies — auth is deferred); lock to the dashboard origin(s) per deploy. CORS is a
    # browser-integration setting, NOT an abuse control (a non-browser client ignores it).
    cors_origins: list[str] = ["*"]


settings = Settings()  # the single config source of truth