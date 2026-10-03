import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("renders the hero and sign-in call to action", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /Financial insight for/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  });

  test("Sign in is the only entry option", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Get started" })).toHaveCount(0);
    await page.getByRole("link", { name: "Sign in", exact: true }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test("feature carousel supports selection, arrows and keyboard navigation", async ({ page }) => {
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "Explore FinSight features" });
  await expect(carousel.getByRole("heading", { name: "Interactive P&L Insights", exact: true })).toBeVisible();
  await carousel.getByRole("button", { name: "Next feature" }).click();
  await expect(carousel.getByRole("button", { name: "Show Financial Forecasting" })).toHaveAttribute("aria-pressed", "true");
  await expect(carousel.getByRole("heading", { name: "Interactive P&L Insights", exact: true })).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(carousel.getByRole("button", { name: "Show AI-Assisted Analysis" })).toHaveAttribute("aria-pressed", "true");
  await carousel.getByRole("button", { name: "Show Interactive P&L Insights" }).click();
  await carousel.getByRole("button", { name: "Previous feature" }).click();
  await expect(carousel.getByRole("button", { name: "Show AI-Assisted Analysis" })).toHaveAttribute("aria-pressed", "true");
});

test("feature carousel fits mobile and supports swipe", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "Explore FinSight features" });
  const slide = carousel.getByRole("group", { name: /1 of 3/ });
  await slide.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 300, clientY: 300 }] });
  await slide.dispatchEvent("touchend", { changedTouches: [{ identifier: 0, clientX: 100, clientY: 310 }] });
  await expect(carousel.getByRole("button", { name: "Show Financial Forecasting" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
