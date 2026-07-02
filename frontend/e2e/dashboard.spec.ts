import { test, expect } from "@playwright/test";

// End-to-end over the shipped surfaces: the app shell, the Home SGRID (clean QDF tickers, no licence
// chip), the Open Data Exploration catalog (reliability + licence verdicts + filtering), Data Insights,
// and the QDF API. Runs against the live dev stack (frontend :5174 → backend :8000).

test.describe("DataQuest — app shell + data", () => {
  test("loads, titled, and the catalog renders (API connected)", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/DataQuest/);
    // the SGRID only fills if the backend served the catalog → proves the API is connected end-to-end
    await expect(page.getByText(/Indicators · 25/)).toBeVisible();
  });

  test("Home SGRID shows clean QDF tickers (no licence chip on the grid)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("USD_GB10YYLD_NSA").first()).toBeVisible();
    await expect(page.getByText("USD_CPI_SA").first()).toBeVisible();
    // the internal source label is gone from the grid
    await expect(page.getByText("ALFRED_LATEST")).toHaveCount(0);
  });
});

test.describe("Open Data Exploration — the catalog browser", () => {
  test("shows reliability + licence verdicts per series", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Data Exploration" }).click();
    await expect(page.getByRole("heading", { name: "Open Data Exploration" })).toBeVisible();

    // both quality columns are present
    await expect(page.getByText("Reliability", { exact: true })).toBeVisible();
    await expect(page.getByText("Licence", { exact: true })).toBeVisible();

    // EUR/USD (ECB) is the one GREEN-licensed series; it is a market rate → FINAL reliability
    const eurRow = page.locator("tr", { hasText: "EUR / USD" });
    await expect(eurRow.getByText("GREEN")).toBeVisible();
    await expect(eurRow.getByText("FINAL")).toBeVisible();

    // the FRED set is RED; the reliability verdicts are computed (not all the same)
    await expect(page.getByText("RED").first()).toBeVisible();
    await expect(page.getByText("RELIABLE").first()).toBeVisible();
    await expect(page.getByText("REVISABLE").first()).toBeVisible();
  });

  test("theme filter narrows the catalog", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Data Exploration" }).click();
    await page.getByRole("button", { name: "Rates", exact: true }).click();
    // a rates ticker stays, an inflation ticker is gone
    await expect(page.getByText("USD_FFRATE_NSA")).toBeVisible();
    await expect(page.getByText("USD_CPI_SA", { exact: true })).toHaveCount(0);
  });

  test("the global top-bar search narrows the catalog", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Data Exploration" }).click();
    // One global search (top bar) drives the catalog — Explore has no second box of its own.
    await page.getByPlaceholder("Search indicators...").fill("payroll");
    await expect(page.getByText("Nonfarm payrolls")).toBeVisible();
    await expect(page.getByText("US CPI", { exact: true })).toHaveCount(0);
  });

  test("the commercial-cleared filter keeps only GREEN-licensed series", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Data Exploration" }).click();
    // the licence column is filterable — EUR/USD (ECB, GREEN) stays, a RED FRED series drops.
    await page.getByText("Commercial-cleared only").click();
    await expect(page.getByText("EUR / USD")).toBeVisible();
    await expect(page.getByText("US CPI", { exact: true })).toHaveCount(0);
  });
});

test.describe("catalog → analysis handoff", () => {
  test("clicking a catalog series charts it on Home", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Data Exploration" }).click();
    // the catalog is no longer a dead end — clicking a row hands the series to the Home dashboard.
    await page.getByRole("row", { name: /Nonfarm payrolls/ }).click();
    // landed on Home — the Indicators SGRID is a Home-only widget
    await expect(page.getByText(/Indicators · /)).toBeVisible();
    // the clicked series is now charted → its provenance line names it
    await expect(page.getByText(/USD_PAYEMS:/)).toBeVisible();
  });
});

test.describe("selection cap — FIFO eviction", () => {
  test("a 5th pick evicts the oldest, holding the chart at 4", async ({ page }) => {
    await page.goto("/");
    // wait for the SGRID to fully populate (name-sorted → stable row order) before clicking
    await expect(page.getByText(/Indicators · 25/)).toBeVisible();
    const rows = page.locator("tbody tr");
    // click 5 distinct indicators — the cap is 4, so the 5th must evict the 1st (first-in, first-out)
    for (let i = 0; i < 5; i++) await rows.nth(i).click();
    await expect(page.locator('tbody tr[data-state="selected"]')).toHaveCount(4);
    await expect(rows.nth(0)).not.toHaveAttribute("data-state", "selected"); // oldest evicted
    await expect(rows.nth(4)).toHaveAttribute("data-state", "selected"); // newest kept
  });
});

test.describe("Data Insights", () => {
  test("the revision workbench renders", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Data Insights" }).click();
    await expect(page.getByRole("heading", { name: /Revision Comparison/ })).toBeVisible();
  });
});

test.describe("QDF API", () => {
  test("returns the macrosynergy long shape + carries provenance", async ({ request }) => {
    const r = await request.get(
      "http://localhost:8000/api/v1/qdf?tickers=USD_CPI_SA,EUR_FXUSD_NSA&start=2025-01-01&end=2025-03-31",
    );
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.data.length).toBeGreaterThan(0);
    for (const key of ["cid", "xcat", "real_date", "value"]) {
      expect(body.data[0]).toHaveProperty(key);
    }
    // provenance gate: ECB + US-gov public-domain series (CPI via FRED) are cleared for commercial DISPLAY
    const ecb = body.provenance.find((p: { ticker: string }) => p.ticker === "EUR_FXUSD_NSA");
    const cpi = body.provenance.find((p: { ticker: string }) => p.ticker === "USD_CPI_SA");
    expect(ecb.commercial_ok).toBe(true);
    expect(cpi.commercial_ok).toBe(true);
  });

  test("rejects an unsupported metric with 422", async ({ request }) => {
    const r = await request.get("http://localhost:8000/api/v1/qdf?tickers=USD_CPI_SA&metrics=grading");
    expect(r.status()).toBe(422);
  });
});
