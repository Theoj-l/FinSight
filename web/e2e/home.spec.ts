import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("renders the hero and sign-in call to action", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /Financial insight for/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^sign in$/i }).first()).toBeVisible();
  });

  test("Sign in is the only entry option", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Get started" })).toHaveCount(0);
    await page.getByRole("link", { name: /^sign in$/i, exact: true }).first().click();
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
  await expect(page.getByTestId("carousel-viewport")).toHaveAttribute("data-animating", "false");
  await carousel.getByRole("button", { name: "Next feature" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(carousel.getByRole("button", { name: "Show AI-Assisted Analysis" })).toHaveAttribute("aria-pressed", "true");
  await carousel.getByRole("button", { name: "Show Interactive P&L Insights" }).click();
  await expect(page.getByTestId("carousel-viewport")).toHaveAttribute("data-animating", "false");
  await carousel.getByRole("button", { name: "Previous feature" }).click();
  await expect(carousel.getByRole("button", { name: "Show AI-Assisted Analysis" })).toHaveAttribute("aria-pressed", "true");
});

test("feature carousel fits mobile and supports swipe", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "Explore FinSight features" });
  const slide = carousel.getByRole("group", { name: /1 of 3/ });
  await slide.evaluate(element => {
    // Desktop Firefox has no Touch constructor; dispatch the same event payload.
    for (const [type, key, x] of [["touchstart", "touches", 300], ["touchend", "changedTouches", 100]] as const) {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, key, { value: [{ identifier: 0, clientX: x, clientY: 300 }] });
      element.dispatchEvent(event);
    }
  });
  await expect(carousel.getByRole("button", { name: "Show Financial Forecasting" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("carousel rotates automatically and pauses while reading or when requested", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "Explore FinSight features" });
  await expect(carousel.getByRole("button", { name: "Show Financial Forecasting" })).toHaveAttribute("aria-pressed", "true", { timeout: 9000 });
  await carousel.hover();
  await page.waitForTimeout(6500);
  await expect(carousel.getByRole("button", { name: "Show Financial Forecasting" })).toHaveAttribute("aria-pressed", "true");
  await carousel.getByRole("button", { name: "Pause automatic rotation" }).click();
  await page.getByRole("heading", { name: /Financial insight for/ }).click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(6500);
  await expect(carousel.getByRole("button", { name: "Show Financial Forecasting" })).toHaveAttribute("aria-pressed", "true");
  await carousel.getByRole("button", { name: "Next feature" }).click();
  await expect(carousel.getByRole("button", { name: "Show AI-Assisted Analysis" })).toHaveAttribute("aria-pressed", "true");
});

test("reduced-motion preference disables automatic rotation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.waitForTimeout(6500);
  await expect(page.getByRole("button", { name: "Show Interactive P&L Insights" })).toHaveAttribute("aria-pressed", "true");
});

test("large-screen layout fills the page and sign-in buttons visibly respond to hover", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1600 });
  await page.goto("/");
  const buttons = await page.getByRole("link", { name: /^sign in$/i, exact: true }).all();
  for (const [index, button] of buttons.entries()) {
    await page.mouse.move(0, 0);
    await expect(button).toHaveCSS("background-color", index === 0 ? "rgba(0, 0, 0, 0)" : "rgb(224, 39, 24)");
    if (index === 0) await expect(button).toHaveCSS("color", "rgb(31, 42, 121)");
    await button.hover();
    if (index === 0) await expect(button).toHaveCSS("color", "rgb(76, 111, 187)");
    await expect(button).toHaveCSS("background-color", index === 0 ? "rgba(0, 0, 0, 0)" : "rgb(184, 31, 18)");
  }
  const features = await page.getByRole("region", { name: "Explore FinSight features" }).boundingBox();
  const footer = await page.locator("footer").boundingBox();
  expect(Math.abs(footer!.y - (features!.y + features!.height))).toBeLessThan(2);
  expect(footer!.y + footer!.height).toBeGreaterThanOrEqual(1600);
  await page.getByRole("link", { name: /^sign in$/i, exact: true }).first().click();
  const card = await page.getByRole("region", { name: "FinSight account" }).boundingBox();
  expect(card!.width).toBe(520);
});

test("Play resumes rotation while its button remains focused", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.getByRole("button", { name: "Pause automatic rotation" }).click();
  await page.getByRole("button", { name: "Resume automatic rotation" }).click();
  await expect(page.getByRole("button", { name: "Show Financial Forecasting" })).toHaveAttribute("aria-pressed", "true", { timeout: 9000 });
});
