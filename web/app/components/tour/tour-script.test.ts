import { describe, expect, it } from "vitest";
import { parseTourScript, tourPageFor } from "./tour-script";

describe("parseTourScript", () => {
  it("accepts a well-formed script and trims text", () => {
    const script = parseTourScript({
      opening: "  Hello  ",
      steps: [{ label: "filters", explanation: " Pick a month. " }],
    });
    expect(script).toEqual({ opening: "Hello", steps: [{ label: "filters", explanation: "Pick a month." }] });
  });

  it("drops unknown labels, empty explanations and duplicate labels", () => {
    const script = parseTourScript({
      opening: "Hi",
      steps: [
        { label: "not-a-real-label", explanation: "x" },
        { label: "filters", explanation: "   " },
        { label: "kpi-cards", explanation: "first" },
        { label: "kpi-cards", explanation: "second" },
        null,
        "oops",
      ],
    });
    expect(script?.steps).toEqual([{ label: "kpi-cards", explanation: "first" }]);
  });

  it("keeps the order the assistant chose", () => {
    const script = parseTourScript({
      opening: "Hi",
      steps: [
        { label: "profit-loss", explanation: "a" },
        { label: "filters", explanation: "b" },
      ],
    });
    expect(script?.steps.map((step) => step.label)).toEqual(["profit-loss", "filters"]);
  });

  it.each([null, undefined, "text", 5, {}, { opening: "x" }, { opening: "", steps: [] }, { opening: "x", steps: [] }])(
    "rejects unusable input %j",
    (input) => {
      expect(parseTourScript(input)).toBeNull();
    },
  );
});

describe("tourPageFor", () => {
  it("only matches the dashboard", () => {
    expect(tourPageFor("/dashboard")).toBe("dashboard");
    expect(tourPageFor("/dashboard/x")).toBe("dashboard");
    expect(tourPageFor("/dashboardx")).toBeNull();
    expect(tourPageFor("/home")).toBeNull();
  });
});
