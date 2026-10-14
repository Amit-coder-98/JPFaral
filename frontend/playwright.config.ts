import { defineConfig } from "@playwright/test";
const port = Number(process.env.JPFARAL_E2E_PORT ?? 5173);
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/ui",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    headless: true,
    channel: "chromium",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { VITE_DATA_MODE: "mock" },
    timeout: 90000,
  },
});
