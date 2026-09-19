import { expect, test } from "@playwright/test";

test.describe("route protection", () => {
  test("visiting Assistant while signed out preserves the login destination", async ({ page }) => {
    await page.goto("/assistant");
    await expect(page).toHaveURL(/\/login\?next=(%2F|\/)assistant$/);
  });
  test("visiting Home while signed out preserves the login destination", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login\?next=(%2F|\/)home$/);
  });
  test("visiting /dashboard while signed out redirects to login", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});
