import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build on port 3100 with a fresh
 * embedded database in ./data/e2e (deleted before each run).
 *   npm run build && npm run test:e2e
 * Set E2E_DEV=1 to run against `next dev` instead (no build needed, slower).
 */
const PORT = 3100;
const dev = process.env.E2E_DEV === "1";
const reset = `node -e "require('fs').rmSync('data/e2e',{recursive:true,force:true})"`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `${reset} && npx next ${dev ? "dev" : "start"} -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { PGLITE_DIR: "./data/e2e", DATABASE_URL: "", SCHEDULER_ENABLED: "false", MARKET_DATA_SOURCE: "demo" },
  },
});
