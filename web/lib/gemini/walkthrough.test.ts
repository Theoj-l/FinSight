import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassificationResult } from "../types/classification";

const writeWalkthroughAnswer = vi.fn();
const getScopeOptions = vi.fn();
vi.mock("./client", () => ({ genai: { models: {} } }));
vi.mock("../text-to-sql/run-readonly", () => ({ runReadOnly: vi.fn() }));
vi.mock("../text-to-sql/answer", () => ({
  writeWalkthroughAnswer: (...args: unknown[]) => writeWalkthroughAnswer(...args),
  writeAnswer: vi.fn(),
  writeAnswerWithWalkthrough: vi.fn(),
}));
vi.mock("../text-to-sql/service", () => ({ getScopeOptions: (...args: unknown[]) => getScopeOptions(...args) }));

const { answerClassicWithWalkthrough, classicScope, periodRange } = await import("./walkthrough");

const classification = (over: Partial<ClassificationResult> = {}): ClassificationResult => ({
  intent: "information_retrieval",
  question_type: "metric_value",
  datasets: [],
  metric: null,
  period: null,
  comparison_period: null,
  dimensions: [],
  filters: {},
  metric_conditions: [],
  top_n: null,
  is_supported: true,
  is_ambiguous: false,
  confidence: 0.9,
  reason: "",
  ...over,
});
const dashboard = { page: "dashboard" as const, periodStart: "202608", periodEnd: "202608", units: [] as string[], branches: [] as string[] };
const on = (page: "home" | "forecast" | "other") => ({ page, units: [] as string[], branches: [] as string[] });

describe("periodRange", () => {
  it("reads a month and a quarter, and ignores relative periods", () => {
    expect(periodRange("2026-05")).toEqual({ periodStart: "202605", periodEnd: "202605" });
    expect(periodRange("2026-Q2")).toEqual({ periodStart: "202604", periodEnd: "202606" });
    expect(periodRange("last_month")).toBeNull();
    expect(periodRange(null)).toBeNull();
  });
});

describe("classicScope", () => {
  it("sends forecast questions to the forecast page", () => {
    expect(classicScope(classification({ question_type: "forecast_retrieval" }), dashboard)).toMatchObject({ page: "forecast" });
  });

  it("sets the dashboard to the month and department asked about", () => {
    expect(classicScope(classification({ period: "2026-05", filters: { department: "TP" } }), on("other"))).toEqual({
      page: "dashboard", periodStart: "202605", periodEnd: "202605", units: ["TP"], branches: [],
    });
  });

  it("keeps the dashboard as it is when no exact month is named", () => {
    expect(classicScope(classification({ period: "last_month" }), dashboard)).toEqual(dashboard);
  });

  it("stays on the home page for a general question asked there", () => {
    expect(classicScope(classification(), on("home"))).toEqual({ page: "home", units: [], branches: [] });
  });

  it("ignores a department filter that is not a code", () => {
    expect(classicScope(classification({ filters: { department: "Heavy Lift & Haulage" } }), dashboard).units).toEqual([]);
  });
});

describe("answerClassicWithWalkthrough", () => {
  const options = { periods: [202605, 202608], units: ["TP"], branches: [] as string[] };
  const script = { opening: "Look.", steps: [{ label: "kpi-cards", explanation: "Here." }] };

  beforeEach(() => {
    writeWalkthroughAnswer.mockReset();
    getScopeOptions.mockReset();
    getScopeOptions.mockResolvedValue(options);
    writeWalkthroughAnswer.mockResolvedValue({ reply: "Revenue was 1.", walkthrough: script, tokens: { input: 1, output: 1 } });
  });

  it("writes the answer with the walkthrough writer and returns the page to open", async () => {
    const result = await answerClassicWithWalkthrough("transport may 2026", classification({ period: "2026-05", filters: { department: "TP" } }), {} as never, dashboard);

    const [contents, target, moved] = writeWalkthroughAnswer.mock.calls[0];
    expect(contents).toContain('"transport may 2026"');
    expect(target).toMatchObject({ page: "dashboard", periodStart: "202605", units: ["TP"] });
    expect(moved).toBe(true);
    expect(result).toEqual({ reply: "Revenue was 1.", walkthrough: script, scope: target });
  });

  it("opens the forecast page for a forecast question asked from Settings", async () => {
    await answerClassicWithWalkthrough("forecast", classification({ question_type: "forecast_retrieval" }), {} as never, on("other"));
    expect(writeWalkthroughAnswer.mock.calls[0][1]).toMatchObject({ page: "forecast" });
  });

  it("still works when the list of real months cannot be read: the period is just not changed", async () => {
    getScopeOptions.mockRejectedValueOnce(new Error("no read-only role"));
    await answerClassicWithWalkthrough("q", classification({ period: "2026-05" }), {} as never, dashboard);
    expect(writeWalkthroughAnswer.mock.calls[0][1]).toMatchObject({ page: "dashboard", periodStart: "202608" });
  });

  it("returns no scope when the writer gives no walkthrough", async () => {
    writeWalkthroughAnswer.mockResolvedValueOnce({ reply: "text", walkthrough: null, tokens: { input: 1, output: 1 } });
    expect(await answerClassicWithWalkthrough("q", classification(), {} as never, dashboard)).toEqual({ reply: "text", walkthrough: null, scope: null });
  });
});
