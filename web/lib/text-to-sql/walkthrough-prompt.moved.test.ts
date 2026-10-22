import { describe, expect, it } from "vitest";
import { buildWalkthroughSystemPrompt } from "./walkthrough-prompt";

const context = { page: "dashboard" as const, periodStart: "202605", periodEnd: "202605", units: ["TP"], branches: [] as string[] };

describe("buildWalkthroughSystemPrompt — when the dashboard has been moved to match the question", () => {
  it("says the page was just set to the scope, so the panels match the answer", () => {
    const prompt = buildWalkthroughSystemPrompt(context, true);
    expect(prompt).toContain("was just opened or set to match the question");
    expect(prompt).toContain("showing period 2026-05, business units: TP");
  });

  it("does not say so when the page was not moved", () => {
    const prompt = buildWalkthroughSystemPrompt(context, false);
    expect(prompt).toContain("The user has the dashboard open, showing period 2026-05");
    expect(prompt).not.toContain("just opened or set");
  });

  it("still tells the model not to claim a panel shows something it does not", () => {
    expect(buildWalkthroughSystemPrompt(context, true)).toMatch(/Never claim a panel shows a figure it does not/);
  });
});
