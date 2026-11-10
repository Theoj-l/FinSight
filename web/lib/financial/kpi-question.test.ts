import { describe, expect, it } from "vitest";
import { kpiQuestion, needsExplaining } from "./kpi-question";

describe("needsExplaining", () => {
  it("is true only for amber and red figures", () => {
    expect(needsExplaining("attention")).toBe(true);
    expect(needsExplaining("unfavourable")).toBe(true);
    expect(needsExplaining("favourable")).toBe(false);
    expect(needsExplaining("unavailable")).toBe(false);
  });
});

describe("kpiQuestion", () => {
  it("lays the question out as short labelled lines", () => {
    expect(
      kpiQuestion({ label: "Total expenses", status: "unfavourable", period: "Aug 2026", value: "S$5,117,060", change: "Up S$343,840 (+7.2%)", reference: "Jul 2026", prior: "S$4,773,220" }),
    ).toBe(
      [
        "Explain the movement in total expenses (Aug 2026).",
        "",
        "• Now: S$5,117,060",
        "• Change: Up S$343,840 (+7.2%) vs Jul 2026",
        "• Before: S$4,773,220",
        "• Status: Unfavourable",
        "",
        "What drove it, and what should I check?",
      ].join("\n"),
    );
  });

  it("leaves out the month and the before line when they are not known", () => {
    const text = kpiQuestion({ label: "Gross margin", status: "attention", value: "29.22%", change: "Down 0.78 pts (−2.6%)", reference: "budget" });
    expect(text.split("\n")[0]).toBe("Explain the movement in gross margin.");
    expect(text).toContain("• Change: Down 0.78 pts (−2.6%) vs budget");
    expect(text).not.toContain("Before:");
    expect(text).toContain("• Status: Attention required");
  });
});
