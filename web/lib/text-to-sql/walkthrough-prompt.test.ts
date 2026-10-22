import { describe, expect, it } from "vitest";
import { TOUR_LABELS } from "../../app/components/tour/tour-labels";
import { RESPONSE_GENERATION_PROMPT } from "../gemini/prompts/response-generation";
import { buildWalkthroughSystemPrompt, WALKTHROUGH_LABELS } from "./walkthrough-prompt";

const context = { page: "dashboard" as const, periodStart: "202606", periodEnd: "202606", units: [], branches: [] };

describe("buildWalkthroughSystemPrompt", () => {
  const prompt = buildWalkthroughSystemPrompt(context);

  it("starts from the same answer guidelines as the plain pipeline", () => {
    expect(prompt.startsWith(RESPONSE_GENERATION_PROMPT)).toBe(true);
  });

  it("names every labelled panel by its id, exactly the ids the page uses", () => {
    expect(WALKTHROUGH_LABELS).toEqual(Object.keys(TOUR_LABELS));
    for (const label of WALKTHROUGH_LABELS) expect(prompt).toContain(`- ${label} (badge ${TOUR_LABELS[label].number})`);
  });

  it("tells the model which period is on screen", () => {
    expect(prompt).toContain("showing period 2026-06");
  });

  it("covers the anomaly, comparison and breakdown panels, and no longer says anomalies have no panel", () => {
    expect(WALKTHROUGH_LABELS).toHaveLength(12);
    expect(prompt).toContain("- anomalies (badge 4)");
    expect(prompt).toContain('"Compare against"');
    expect(prompt).toContain("- expense-by-category");
    expect(prompt).not.toMatch(/NO panel for[^.]*anomalies/);
  });

  it("lists the panels in page order, so badge numbers rise down the page", () => {
    const numbers = WALKTHROUGH_LABELS.map((label) => TOUR_LABELS[label].number);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it("says when not to point at a panel", () => {
    expect(prompt).toContain("NO panel for receivables");
    expect(prompt).toMatch(/Set it to null when no panel helps/);
    expect(prompt).toMatch(/Check what the panels show/);
  });
});
