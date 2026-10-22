import { defineConfig, devices } from "@playwright/test";

// Isolated production-component checks: auth/API/router are controlled fixtures.
export default defineConfig({
  testDir: "./tests/browser", testMatch: "anomalies.spec.ts", fullyParallel: true,
  use: { baseURL: "http://localhost:4174" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
