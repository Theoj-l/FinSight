import { expect, test, type Page } from "@playwright/test";

async function settled(page: Page, index: number) {
  const frame = page.getByTestId("carousel-viewport");
  await expect(frame).toHaveAttribute("data-animating", "false");
  const metrics = await frame.evaluate(element => {
    const frame = element.getBoundingClientRect();
    return {
      overflow: getComputedStyle(element).overflowX,
      width: frame.width, height: frame.height,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      slides: [...element.querySelectorAll("article")].map(slide => {
        const rect = slide.getBoundingClientRect();
        return {
          label: slide.getAttribute("aria-label"),
          displayed: getComputedStyle(slide).display !== "none",
          intersection: Math.max(0, Math.min(frame.right, rect.right) - Math.max(frame.left, rect.left)) * Math.max(0, Math.min(frame.bottom, rect.bottom) - Math.max(frame.top, rect.top)),
          left: rect.left - frame.left, top: rect.top - frame.top, width: rect.width,
        };
      }),
    };
  });
  expect(metrics.overflow).toBe("hidden");
  expect(metrics.pageOverflow).toBe(false);
  expect(metrics.slides.filter(slide => slide.displayed)).toHaveLength(1);
  expect(metrics.slides.filter(slide => slide.intersection > 1)).toHaveLength(1);
  const active = metrics.slides[index];
  expect(active.displayed).toBe(true);
  expect(Math.abs(active.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(active.top)).toBeLessThanOrEqual(2);
  expect(Math.abs(active.width - metrics.width)).toBeLessThanOrEqual(2);
  return metrics;
}

for (const width of [375, 768, 1440, 2560]) {
  test(`one feature at a time through forward/reverse loops at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 1440 ? 1600 : 1000 });
    await page.goto("/");
    await page.getByRole("button", { name: "Pause automatic rotation" }).click();
    const first = await settled(page, 0);
    for (const index of [1, 2, 0, 1, 2, 0]) {
      await page.getByRole("button", { name: "Next feature" }).click();
      const current = await settled(page, index);
      expect(Math.abs(current.height - first.height)).toBeLessThanOrEqual(2);
    }
    for (const index of [2, 1, 0]) {
      await page.getByRole("button", { name: "Previous feature" }).click();
      await settled(page, index);
    }
    await page.getByTestId("carousel-viewport").screenshot({ path: test.info().outputPath(`carousel-${width}.png`) });
  });
}

test("animation frames stay clipped, contiguous and move monotonically", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Pause automatic rotation" }).click();
  await settled(page, 0);
  const frame = page.getByTestId("carousel-viewport");
  const samples = await frame.evaluate(async element => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Next feature"]')!;
    button.click();
    const samples: { x: number; covered: number; visible: number; height: number }[] = [];
    const start = performance.now();
    while (performance.now() - start < 850) {
      await new Promise(requestAnimationFrame);
      const viewport = element.getBoundingClientRect();
      const slides = [...element.querySelectorAll("article")];
      const rects = slides.filter(s => getComputedStyle(s).display !== "none").map(s => s.getBoundingClientRect());
      const incoming = slides[1].getBoundingClientRect();
      if (getComputedStyle(slides[1]).display === "none") continue;
      const covered = rects.reduce((sum, r) => sum + Math.max(0, Math.min(viewport.right - 1, r.right) - Math.max(viewport.left + 1, r.left)), 0);
      samples.push({ x: incoming.left - viewport.left - 1, covered, visible: rects.length, height: viewport.height });
    }
    return { samples, width: element.clientWidth };
  });
  expect(samples.samples.length).toBeGreaterThan(8);
  expect(samples.samples.some(s => s.x > 20 && s.x < samples.width - 20)).toBe(true);
  for (let i = 0; i < samples.samples.length; i++) {
    const sample = samples.samples[i];
    expect(sample.visible).toBeLessThanOrEqual(2);
    expect(Math.abs(sample.covered - samples.width)).toBeLessThan(3);
    expect(Math.abs(sample.height - samples.samples[0].height)).toBeLessThan(2);
    if (i) expect(sample.x).toBeLessThanOrEqual(samples.samples[i - 1].x + 1);
  }
  await settled(page, 1);
});

test("rapid clicks and direction changes cannot start overlapping animations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pause automatic rotation" }).click();
  await page.evaluate(() => {
    const next = document.querySelector<HTMLButtonElement>('button[aria-label="Next feature"]')!;
    const previous = document.querySelector<HTMLButtonElement>('button[aria-label="Previous feature"]')!;
    for (let i = 0; i < 20; i++) { next.click(); previous.click(); }
  });
  await settled(page, 1);
  await page.getByRole("button", { name: "Previous feature" }).click();
  await settled(page, 0);
});

test("losing carousel CSS cannot expose all three features", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pause automatic rotation" }).click();
  const removed = await page.evaluate(() => {
    let removed = 0;
    // Next may bundle several modules in one sheet: remove only carousel rules.
    for (const sheet of [...document.styleSheets]) {
      for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
        if (sheet.cssRules[i].cssText.includes("feature-carousel-module")) { sheet.deleteRule(i); removed++; }
      }
    }
    return removed;
  });
  expect(removed).toBeGreaterThan(0);
  await settled(page, 0);
  await page.getByRole("button", { name: "Next feature" }).click();
  await settled(page, 1);
});

test("resize during a transition settles cleanly and survives reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pause automatic rotation" }).click();
  await page.getByRole("button", { name: "Next feature" }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await settled(page, 1);
  await page.reload();
  await page.getByRole("button", { name: "Pause automatic rotation" }).click();
  await settled(page, 0);
});

test("automatic rotation presents 1 → 2 → 3 → 1 as individual features", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  const selectors = page.getByRole("region", { name: "Explore FinSight features" }).locator('button[aria-pressed]');
  await settled(page, 0);
  for (const index of [1, 2, 0]) {
    await expect(selectors.nth(index)).toHaveAttribute("aria-pressed", "true", { timeout: 9000 });
    await settled(page, index);
  }
});
