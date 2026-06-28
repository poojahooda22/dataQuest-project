# DataQuest

**An open, point-in-time macro-economic data service.** DataQuest lets you query economic
indicators *as they were known on any past date* — the "vintage" (point-in-time) view that most
public data portals throw away when they overwrite each release with its latest revision.

Every series it serves is sourced from public-domain data, with provenance and licensing tracked
per series, so the data is free to use and redistribute.

## Why point-in-time matters

Most economic data is *revised* after it is first published. GDP, CPI, and employment figures all
get restated for months after release. An analysis or backtest that uses today's revised history is
quietly cheating — it "knows" numbers nobody actually had at the time.

DataQuest stores every release as an immutable, append-only record, so you can ask *"what did the
data say on 2020-03-15?"* and get the answer the world actually had that day.

## Architecture

A monorepo with two deployables and a database:

```
dataquest-project/
├── backend/    FastAPI read API + ingest worker (Python)   → Fly.io
├── frontend/   Vite + React dashboard (TypeScript)          → Vercel
└── (database)  PostgreSQL + TimescaleDB                      → managed Postgres
```

- **Read API** (`backend/`) — a persistent FastAPI service that serves vintage queries from the
  store. It holds a database connection pool and never fetches from upstream sources on the request
  path.
- **Ingest worker** — off-request, idempotent, append-only writes into the vintage store.
- **Vintage store** — PostgreSQL + TimescaleDB, indexed for the point-in-time query
  `(series, observation_date, vintage_date)`.
- **Dashboard** (`frontend/`) — a React SPA that charts series and their revisions.

### Stack

| Layer | Technology |
|---|---|
| API | Python 3.12 · FastAPI · SQLModel · Pydantic v2 · Uvicorn |
| Database | PostgreSQL 16 · TimescaleDB · Alembic migrations |
| Packaging | uv |
| Frontend | React 19 · Vite · TypeScript · Tailwind v4 · shadcn/ui · TanStack Query · ECharts |
| Deploy | Fly.io (API) · Vercel (frontend) |

## Run it locally

### Backend

Requires [uv](https://docs.astral.sh/uv/) and Docker.

```bash
cd backend
docker compose up -d                       # PostgreSQL + TimescaleDB on :5432
uv sync                                     # install dependencies
uv run alembic upgrade head                 # create the schema
uv run uvicorn app.main:app --port 8000 --reload
```

Open <http://localhost:8000/docs> for the interactive API (Swagger).

To set a FRED/ALFRED API key for the ingest worker, copy `backend/.env.example` to `backend/.env`
and fill it in.

### Frontend

Requires Node.js.

```bash
cd frontend
npm install
npm run dev                                 # http://localhost:5173
```

Copy `frontend/.env.example` to `frontend/.env` and point `VITE_BACKEND_URL` at the API
(defaults to `http://localhost:8000`).

## Deployment

- **Backend → Fly.io.** It is a persistent process (it holds a database pool), so it runs on Fly
  rather than a serverless platform. `fly deploy` from `backend/`; set `DATABASE_URL` and
  `FRED_API_KEY` with `fly secrets set`.
- **Frontend → Vercel.** Import the repo, set the project root directory to `frontend`, framework
  preset Vite. Set `VITE_BACKEND_URL` to the deployed API URL.
- Set the API's `CORS_ORIGINS` to the deployed frontend origin so the browser can call it.

## License

Released under the [MIT License](LICENSE).
