import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit / integration tests for server-side code (route handlers, lib helpers,
 * server actions). Runs in a Node environment — no browser.
 *
 * Browser end-to-end tests are separate: see `playwright.config.ts` and `e2e/`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["{app,lib}/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    clearMocks: true,
  },
});
