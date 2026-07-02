import { defineConfig, devices } from "@playwright/test";

// End-to-end against the running dev stack: the Vite frontend (:5174) talking to the FastAPI backend
// (:8000). The frontend dev server is auto-started/reused here; the BACKEND must be running separately
// (`uvicorn app.main:app` on :8000) — the app only shows "API connected" and renders data when it is.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5174",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
