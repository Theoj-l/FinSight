import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("renders the hero and sign-in call to action", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /Financial insight for/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  });

  test("'Get started' links to the signup page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Get started" }).first().click();
    await expect(page).toHaveURL(/\/signup$/);
  });
});
