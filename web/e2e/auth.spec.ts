import { expect, test } from "@playwright/test";

test.describe("route protection", () => {
  test("visiting /dashboard while signed out redirects to login", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});
