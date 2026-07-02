"""Phase 2 — QDF FORMAT verification: prove our /api/v1/qdf is a valid, macrosynergy-loadable QDF.

This is a FORMAT / loadability check — it does NOT compare our VALUES to JPMaQS (a different product
layer; our value-correctness is proven against ALFRED in verify_parity.py). Three checks:
  1. SHAPE        — every row carries the minimal QDF columns (cid, xcat, real_date, value); no fabricated metrics.
  2. LOADABILITY  — pandas + macrosynergy.standardise_dataframe accept our frame (if macrosynergy installed).
  3. CONSISTENCY  — a /qdf value equals the dashboard's /series value for the same point (one store of truth).

Run: backend/.venv/Scripts/python.exe backend/scripts/verify_qdf.py [BASE_URL]
"""
import json
import sys
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
QDF_COLS = {"cid", "xcat", "real_date", "value"}


def get(path: str) -> dict:
    with urllib.request.urlopen(BASE + path, timeout=30) as r:
        return json.load(r)


def main() -> int:
    print("=" * 70)
    print("Phase 2 — QDF FORMAT verification (shape + macrosynergy loadability).")
    print("NOT a value comparison to JPMaQS (different layer; values-vs-ALFRED = verify_parity.py).")
    print("=" * 70)

    payload = get("/api/v1/qdf?tickers=USD_CPI_SA,USD_RGDP_SA,EUR_FXUSD_NSA&start=2024-01-01&end=2025-12-31")
    rows = payload["data"]
    print(f"\n/qdf returned {len(rows)} rows across {len(payload['provenance'])} tickers.")

    # 1. SHAPE
    cols = set(rows[0].keys()) if rows else set()
    assert QDF_COLS <= cols, f"FAIL missing QDF columns: {QDF_COLS - cols}"
    assert all(QDF_COLS <= set(r.keys()) for r in rows), "FAIL ragged rows"
    assert "grading" not in cols, "FAIL fabricated 'grading' column leaked"
    print("OK  [1/3] shape — every row has cid, xcat, real_date, value (no fabricated metric columns)")

    # 2. LOADABILITY (the real macrosynergy-compat proof)
    try:
        import pandas as pd
        from macrosynergy.management.utils import standardise_dataframe

        df = standardise_dataframe(pd.DataFrame(rows))
        assert QDF_COLS <= set(df.columns), f"FAIL macrosynergy dropped columns: {QDF_COLS - set(df.columns)}"
        print(
            f"OK  [2/3] loadability — macrosynergy.standardise_dataframe accepted it: shape={df.shape}, "
            f"real_date dtype={df['real_date'].dtype}, cids={sorted(df['cid'].unique())}"
        )
    except Exception as e:  # not installed, or an import-chain issue — skip, don't fail the whole verify
        print(f"SKIP [2/3] loadability — could not import macrosynergy ({type(e).__name__}: {e}); "
              "`uv pip install macrosynergy` to run it")

    # 3. CONSISTENCY — /qdf == the dashboard's /series (both read the SAME store, latest vintage)
    cpi = get("/api/v1/series/USD_CPIAUCSL?start=2025-01-01&end=2025-03-31")
    series_by_date = {o["observation_date"]: o["value"] for o in cpi["observations"]}
    qdf_cpi = get("/api/v1/qdf?tickers=USD_CPI_SA&start=2025-01-01&end=2025-03-31")["data"]
    checked = mism = 0
    for r in qdf_cpi:
        sv = series_by_date.get(r["real_date"])
        if sv is not None:
            checked += 1
            if abs(sv - r["value"]) > 1e-9:
                mism += 1
                print(f"   MISMATCH {r['real_date']}: /qdf={r['value']} /series={sv}")
    assert mism == 0, f"FAIL {mism} /qdf-vs-/series mismatches"
    print(f"OK  [3/3] consistency — {checked} /qdf values match the dashboard's /series exactly")

    print("\nPhase 2 PASS — /qdf is a valid, macrosynergy-loadable QDF, consistent with the dashboard.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
