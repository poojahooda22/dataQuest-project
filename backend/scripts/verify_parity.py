"""Data-parity verification: our stored values vs the authoritative source (ALFRED/FRED).

Two regimes, two correct checks:
  * regime A (vintage_capable) — compare AS-KNOWN-ON: ALFRED realtime_start=realtime_end=<vintage>
    must return our stored point-in-time value. Proves the vintage store is faithful.
  * regime B (rate/FX, no revisions by construction) — compare LATEST: FRED's current value for the
    observation date must equal ours (a realtime query is meaningless for a series with one vintage).

Proves the cynical-charter rule: a faithful pipe (same number, different fetch path), never fabricated.
FRED key is read from backend/.env and never printed. Read-only API use (verify, not cache).

Run:  backend/.venv/Scripts/python.exe backend/scripts/verify_parity.py [SAMPLE_PER_SERIES]
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import psycopg

BACKEND = Path(__file__).resolve().parent.parent
ENV_PATH = BACKEND / ".env"
DB_DSN = "postgresql://dataquest:dataquest@localhost:5432/dataquest"
ALFRED = "https://api.stlouisfed.org/fred/series/observations"
TOL = 1e-6  # relative; published macro values are exact decimals, so parity should be ~exact


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def alfred_value(key: str, series_id: str, obs: str, vintage: str | None) -> str | None:
    """Value of `series_id` for period `obs`. vintage given → AS KNOWN ON that day (realtime);
    vintage None → the CURRENT value (for no-revision rate/FX series)."""
    params = {
        "series_id": series_id,
        "observation_start": obs,
        "observation_end": obs,
        "file_type": "json",
        "api_key": key,
    }
    if vintage is not None:
        params["realtime_start"] = vintage
        params["realtime_end"] = vintage
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{ALFRED}?{q}", headers={"User-Agent": "dataquest-parity-check"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    obss = data.get("observations", [])
    return obss[0]["value"] if obss else None


def matches(ours: float, theirs: str | None) -> bool:
    if theirs in (".", "", None):
        return False
    t = float(theirs)
    return abs(ours - t) <= TOL * max(1.0, abs(t))


def run_pass(label: str, key: str, rows: list[tuple]) -> dict[str, int]:
    """rows: (source_series_id, observation_date, value, vintage_or_None)."""
    print(f"\n### {label} — {len(rows)} points "
          f"({len({r[0] for r in rows})} series)")
    hdr = f"{'series':<10} {'observation':<12} {'as-of':<12} {'ours':>14} {'source':>14}  verdict"
    print(hdr)
    print("-" * len(hdr))
    c = {"checked": 0, "matched": 0, "mismatch": 0, "missing": 0, "errors": 0}
    bad: list[str] = []
    for sid, obs, ours, vintage in rows:
        asof = vintage if vintage is not None else "latest"
        try:
            theirs = alfred_value(key, sid, obs, vintage)
        except Exception as e:
            c["errors"] += 1
            print(f"{sid:<10} {obs:<12} {asof:<12} {ours:>14} {'ERR':>14}  ! {type(e).__name__}")
            time.sleep(0.5)
            continue
        c["checked"] += 1
        if theirs in (".", "", None):
            c["missing"] += 1
            verdict, shown = "~ not-in-source", str(theirs)
        elif matches(float(ours), theirs):
            c["matched"] += 1
            verdict, shown = "OK", theirs
        else:
            c["mismatch"] += 1
            verdict, shown = "MISMATCH", theirs
            bad.append(f"{sid} {obs}@{asof}: ours={ours} source={theirs}")
        print(f"{sid:<10} {obs:<12} {asof:<12} {ours:>14} {shown:>14}  {verdict}")
        time.sleep(0.5)  # ALFRED ~120 req/min — stay under
    if bad:
        print("  MISMATCHES (real findings):")
        for b in bad:
            print("   - " + b)
    return c


def main() -> int:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    env = load_env(ENV_PATH)
    key = env.get("FRED_API_KEY")
    if not key:
        print("FATAL: FRED_API_KEY not found in backend/.env")
        return 2

    vintage_sql = """
        SELECT s.source_series_id, o.observation_date::text, o.value, o.vintage_date::text
        FROM observation o JOIN series s ON s.series_id = o.series_id
        WHERE s.source_series_id = %s AND s.vintage_capable
        ORDER BY md5(o.id::text) LIMIT %s
    """
    latest_sql = """
        SELECT s.source_series_id, o.observation_date::text, o.value, NULL
        FROM observation o JOIN series s ON s.series_id = o.series_id
        WHERE s.source_series_id = %s AND NOT s.vintage_capable
        ORDER BY md5(o.id::text) LIMIT %s
    """
    with psycopg.connect(DB_DSN) as conn:
        vint_t = [r[0] for r in conn.execute(
            "SELECT source_series_id FROM series WHERE source='ALFRED' AND vintage_capable "
            "ORDER BY source_series_id").fetchall()]
        late_t = [r[0] for r in conn.execute(
            "SELECT source_series_id FROM series WHERE source IN ('ALFRED','ALFRED_LATEST') "
            "AND NOT vintage_capable ORDER BY source_series_id").fetchall()]
        vint_rows: list[tuple] = []
        for sid in vint_t:
            vint_rows.extend(conn.execute(vintage_sql, (sid, n)).fetchall())
        late_rows: list[tuple] = []
        for sid in late_t:
            late_rows.extend(conn.execute(latest_sql, (sid, n)).fetchall())

    a = run_pass("REGIME A — vintage-matched (as-known-on)", key, vint_rows)
    b = run_pass("REGIME B — latest-value (rate series, no revisions)", key, late_rows)

    print("\n" + "=" * 64)
    for nm, c in (("vintage", a), ("latest", b)):
        print(f"{nm:>8}: checked={c['checked']} matched={c['matched']} "
              f"MISMATCH={c['mismatch']} missing={c['missing']} errors={c['errors']}")
    tot_bad = a["mismatch"] + b["mismatch"]
    print(f"\nNOT yet covered (need their own source): ECB EUR/USD FX, PhillyFed (EMPLOY/ROUTPUT/RUC).")
    return 1 if tot_bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
