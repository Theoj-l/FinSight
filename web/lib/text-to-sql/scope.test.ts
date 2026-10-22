import { describe, expect, it } from "vitest";
import { sameScope, validateScope, type ScopeOptions } from "./context";

const options: ScopeOptions = {
  periods: [202604, 202605, 202606, 202607, 202608],
  units: ["CP", "HL", "TP"],
  branches: ["KL"],
};
const scope = (over: Record<string, unknown> = {}) => ({
  page: "dashboard" as const,
  periodStart: "202605",
  periodEnd: "202605",
  units: ["TP"],
  branches: [] as string[],
  ...over,
});

describe("validateScope", () => {
  it("accepts a scope whose months and codes exist", () => {
    expect(validateScope(scope(), options)).toEqual(scope());
    expect(validateScope(scope({ periodStart: "202604", periodEnd: "202606" }), options)).toMatchObject({ periodStart: "202604", periodEnd: "202606" });
  });

  it("is null when the model proposed nothing", () => {
    expect(validateScope(null, options)).toBeNull();
    expect(validateScope({ page: "dashboard", units: [], branches: [] }, options)).toBeNull();
  });

  it("is null for a month that has no data, or a range that runs backwards", () => {
    expect(validateScope(scope({ periodStart: "202609", periodEnd: "202609" }), options)).toBeNull();
    expect(validateScope(scope({ periodStart: "202401", periodEnd: "202605" }), options)).toBeNull();
    expect(validateScope(scope({ periodStart: "202606", periodEnd: "202604" }), options)).toBeNull();
  });

  it("drops unit and branch codes that do not exist, and keeps the rest", () => {
    expect(validateScope(scope({ units: ["TP", "ZZ"], branches: ["KL", "XX"] }), options)).toMatchObject({ units: ["TP"], branches: ["KL"] });
    expect(validateScope(scope({ units: ["ZZ"] }), options)).toMatchObject({ units: [] });
  });
});

describe("sameScope", () => {
  it("treats the same period and units as the same, whatever the order", () => {
    expect(sameScope(scope({ units: ["CP", "TP"] }), scope({ units: ["TP", "CP"] }))).toBe(true);
  });

  it("treats a missing end month as the start month", () => {
    expect(sameScope(scope({ periodEnd: undefined }), scope())).toBe(true);
  });

  it("notices a different month, unit or branch", () => {
    expect(sameScope(scope(), scope({ periodStart: "202606", periodEnd: "202606" }))).toBe(false);
    expect(sameScope(scope(), scope({ units: [] }))).toBe(false);
    expect(sameScope(scope(), scope({ branches: ["KL"] }))).toBe(false);
  });

  it("a dashboard on its default view is not the same as one with a month chosen", () => {
    expect(sameScope({ page: "dashboard", units: [], branches: [] }, scope({ units: [] }))).toBe(false);
  });

  it("two missing scopes match, one missing does not", () => {
    expect(sameScope(null, null)).toBe(true);
    expect(sameScope(null, scope())).toBe(false);
  });
});

describe("scopes for pages other than the dashboard", () => {
  const forecast = (over: Record<string, unknown> = {}) => ({ page: "forecast" as const, units: ["TP"], branches: [] as string[], ...over });

  it("validateScope keeps the forecast page's real units and drops the rest, with no period needed", () => {
    expect(validateScope(forecast({ units: ["TP", "ZZ"] }), options)).toEqual({ page: "forecast", units: ["TP"], branches: [] });
  });

  it("validateScope gives the home page no filters at all", () => {
    expect(validateScope({ page: "home", units: ["TP"], branches: ["KL"] }, options)).toEqual({ page: "home", units: [], branches: [] });
  });

  it("validateScope never accepts page 'other'", () => {
    expect(validateScope({ page: "other", units: [], branches: [] }, options)).toBeNull();
  });

  it("sameScope tells pages apart, and ignores filters a page does not have", () => {
    expect(sameScope(forecast(), scope())).toBe(false);
    expect(sameScope(forecast(), forecast({ periodStart: "202601" }))).toBe(true);
    expect(sameScope({ page: "home", units: ["A"], branches: [] }, { page: "home", units: [], branches: [] })).toBe(true);
    expect(sameScope(forecast(), forecast({ units: [] }))).toBe(false);
  });
});
