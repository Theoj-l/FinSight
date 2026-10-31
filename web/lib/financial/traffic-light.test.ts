import { describe, expect, it } from "vitest";
import { compareValue } from "./engine";
import { trafficLight } from "./traffic-light";

const rule = (tolerance: number, enabled = true) => ({ enabled, tolerance });

describe("trafficLight", () => {
  it("is green for a favourable or unchanged figure", () => {
    expect(trafficLight(compareValue("revenue", "110", "100", rule(5)))).toBe("favourable");
    expect(trafficLight(compareValue("operatingExpenses", "90", "100", rule(5)))).toBe("favourable");
    expect(trafficLight(compareValue("revenue", "100", "100", rule(0)))).toBe("favourable");
  });

  it("is amber for an unfavourable change within the Settings threshold", () => {
    expect(trafficLight(compareValue("revenue", "96", "100", rule(5)))).toBe("attention");
    expect(trafficLight(compareValue("operatingExpenses", "104", "100", rule(5)))).toBe("attention");
  });

  it("is red beyond the threshold, the same rule that raises notifications", () => {
    const c = compareValue("revenue", "90", "100", rule(5));
    expect(c.breach).toBe(true);
    expect(trafficLight(c)).toBe("unfavourable");
    // A 0% threshold makes every unfavourable change red.
    expect(trafficLight(compareValue("revenue", "99.99", "100", rule(0)))).toBe("unfavourable");
  });

  it("stays amber when alerts are switched off, and is unavailable with nothing to compare", () => {
    expect(trafficLight(compareValue("revenue", "50", "100", rule(5, false)))).toBe("attention");
    expect(trafficLight(compareValue("revenue", "50", null, rule(5)))).toBe("unavailable");
    expect(trafficLight(undefined)).toBe("unavailable");
  });
});
