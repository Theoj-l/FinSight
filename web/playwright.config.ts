import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright end-to-end tests for the web app.
 *
 * By default `webServer` boots `next dev` (or reuses one you already have
 * running) and waits for it before the suite starts. The dev server reads
 * `web/.env`, so the same env you need for `npm run dev` is what the
 * browser-facing tests need too.
 *
 * Set `PLAYWRIGHT_BASE_URL` to run the suite against an already-running
 * deployment instead; `webServer` is then skipped.
 *
 * https://playwright.dev/docs/test-configuration
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",

  use: {
    baseURL,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      testMatch: /(?:home|auth|carousel)\.spec\.ts/,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "firefox",
      testMatch: /(?:home|auth|carousel)\.spec\.ts/,
      use: { ...devices["Desktop Firefox"] },
    },
  ],

  webServer: externalBaseURL
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
