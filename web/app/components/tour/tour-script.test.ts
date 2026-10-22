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

describe("parseTourScript — one page", () => {
  const mixed = { opening: "Here.", steps: [{ label: "kpi-cards", explanation: "a" }, { label: "forecast-chart", explanation: "b" }] };

  it("keeps only the steps on the given page", () => {
    expect(parseTourScript(mixed, "forecast")?.steps.map((step) => step.label)).toEqual(["forecast-chart"]);
    expect(parseTourScript(mixed, "dashboard")?.steps.map((step) => step.label)).toEqual(["kpi-cards"]);
  });

  it("is null when no step is on that page", () => {
    expect(parseTourScript(mixed, "home")).toBeNull();
  });

  it("keeps every valid step when no page is given", () => {
    expect(parseTourScript(mixed)?.steps).toHaveLength(2);
  });
});

describe("tourPageFor", () => {
  it("matches the pages that have labelled parts, and nothing else", () => {
    expect(tourPageFor("/dashboard")).toBe("dashboard");
    expect(tourPageFor("/dashboard/x")).toBe("dashboard");
    expect(tourPageFor("/forecast")).toBe("forecast");
    expect(tourPageFor("/home")).toBe("home");
    expect(tourPageFor("/dashboardx")).toBeNull();
    expect(tourPageFor("/reports")).toBeNull();
    expect(tourPageFor("/settings")).toBeNull();
  });
});
