import { describe, expect, it } from "vitest";
import { labelsForPage, TOUR_LABELS, TOUR_PAGES } from "../../app/components/tour/tour-labels";
import { RESPONSE_GENERATION_PROMPT } from "../gemini/prompts/response-generation";
import { buildWalkthroughSystemPrompt, walkthroughLabels } from "./walkthrough-prompt";

const dashboard = { page: "dashboard" as const, periodStart: "202606", periodEnd: "202606", units: [], branches: [] };
const forecast = { page: "forecast" as const, units: [], branches: [] };
const home = { page: "home" as const, units: [], branches: [] };

describe("buildWalkthroughSystemPrompt", () => {
  const prompt = buildWalkthroughSystemPrompt(dashboard);

  it("starts from the same answer guidelines as the plain pipeline", () => {
    expect(prompt.startsWith(RESPONSE_GENERATION_PROMPT)).toBe(true);
  });

  it("names every panel of the page by its id, exactly the ids the page uses", () => {
    expect(walkthroughLabels("dashboard")).toEqual(labelsForPage("dashboard"));
    for (const label of walkthroughLabels("dashboard")) expect(prompt).toContain(`- ${label} (badge ${TOUR_LABELS[label].number})`);
  });

  it("tells the model which period is on screen", () => {
    expect(prompt).toContain("showing period 2026-06");
  });

  it("covers the anomaly, comparison and breakdown panels, and no longer says anomalies have no panel", () => {
    expect(walkthroughLabels("dashboard")).toHaveLength(12);
    expect(prompt).toContain("- anomalies (badge 4)");
    expect(prompt).toContain('"Compare against"');
    expect(prompt).toContain("- expense-by-category");
    expect(prompt).not.toMatch(/NO panel for[^.]*anomalies/);
  });

  it("lists each page's panels in page order, so badge numbers rise down the page", () => {
    for (const page of TOUR_PAGES) {
      const numbers = walkthroughLabels(page).map((label) => TOUR_LABELS[label].number);
      expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    }
  });

  it("asks for explanations that answer the question, not generic chart descriptions", () => {
    expect(prompt).toMatch(/answers the user's QUESTION as seen on that panel/);
    expect(prompt).toMatch(/Never describe the chart in general/);
    expect(prompt).toMatch(/leave that panel out/);
    expect(prompt).toMatch(/Use "filters" only when the dashboard was just moved/);
  });

  it("always asks for a walkthrough, using the closest panel when none shows the exact figures", () => {
    expect(prompt).toMatch(/ALWAYS return a walkthrough with at least one step/);
    expect(prompt).toMatch(/use the closest related panel and say plainly what it does show/);
    expect(prompt).not.toMatch(/or null/);
    expect(prompt).toMatch(/Never claim a panel shows a figure it does not/);
  });
});

describe("buildWalkthroughSystemPrompt — one page at a time", () => {
  it("describes only the target page's panels, so the model cannot point at another page", () => {
    const prompt = buildWalkthroughSystemPrompt(forecast);
    for (const label of labelsForPage("forecast")) expect(prompt).toContain(`- ${label} (badge ${TOUR_LABELS[label].number})`);
    for (const label of labelsForPage("dashboard")) expect(prompt).not.toContain(`- ${label} (badge`);
    for (const label of labelsForPage("home")) expect(prompt).not.toContain(`- ${label} (badge`);
  });

  it("explains the forecast page: metric switch, chart lines, and that projections are estimates", () => {
    const prompt = buildWalkthroughSystemPrompt(forecast);
    expect(prompt).toContain("showing business units: all business units");
    expect(prompt).toMatch(/switch between revenue, cost and net profit/);
    expect(prompt).toMatch(/projections are estimates, not guarantees/);
    expect(prompt).toMatch(/no period filter/);
  });

  it("explains the home page", () => {
    const prompt = buildWalkthroughSystemPrompt(home);
    expect(prompt).toContain("- home-snapshot (badge 1)");
    expect(prompt).toContain("- home-attention (badge 2)");
    expect(prompt).toContain("The user has the home page open");
  });

  it("names the page being explained, so the steps do not call it by another page's name", () => {
    expect(buildWalkthroughSystemPrompt(forecast)).toContain("The walkthrough is for the forecast page");
    expect(buildWalkthroughSystemPrompt(dashboard)).toContain("The walkthrough is for the dashboard");
    expect(buildWalkthroughSystemPrompt(home)).toContain("The walkthrough is for the home page");
  });

  it("limits the labels the model may return to the target page", () => {
    expect(walkthroughLabels("forecast")).toEqual(["forecast-filters", "forecast-metric", "forecast-summary", "forecast-chart", "forecast-horizon"]);
    expect(walkthroughLabels("home")).toEqual(["home-snapshot", "home-attention"]);
  });
});
