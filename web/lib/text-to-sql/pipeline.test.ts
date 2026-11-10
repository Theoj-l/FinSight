import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TourScript } from "../../app/components/tour/tour-script";

const generateSql = vi.fn();
const runReadOnly = vi.fn();
const writeAnswer = vi.fn();
const writeAnswerWithWalkthrough = vi.fn();
vi.mock("./generate-sql", () => ({ generateSql: (...args: unknown[]) => generateSql(...args) }));
vi.mock("./run-readonly", () => ({ runReadOnly: (...args: unknown[]) => runReadOnly(...args) }));
vi.mock("./answer", () => ({
  writeAnswer: (...args: unknown[]) => writeAnswer(...args),
  writeAnswerWithWalkthrough: (...args: unknown[]) => writeAnswerWithWalkthrough(...args),
}));

const { answerWithDirectSql } = await import("./pipeline");

const scopeOptions = { periods: [202605, 202606, 202608], units: ["CP", "TP"], branches: [] as string[] };
const dashboard = (over: Record<string, unknown> = {}) => ({
  page: "dashboard" as const,
  periodStart: "202606",
  periodEnd: "202606",
  units: [] as string[],
  branches: [] as string[],
  ...over,
});
const plan = (over: Record<string, unknown> = {}) => ({
  supported: true,
  needsClarification: null,
  reason: "",
  queries: [{ purpose: "revenue", sql: "select 1 as x from dept" }],
  scope: null,
  tokens: { input: 1, output: 1 },
  ...over,
});
const walkthrough: TourScript = { opening: "Look.", steps: [{ label: "filters", explanation: "Here." }] };
const options = { today: "2026-10-21", latestPeriod: 202608 };

beforeEach(() => {
  generateSql.mockReset();
  runReadOnly.mockReset();
  writeAnswer.mockReset();
  writeAnswerWithWalkthrough.mockReset();
  runReadOnly.mockResolvedValue({ rows: [{ x: 1 }], rowCount: 1, truncated: false, ms: 1 });
  writeAnswer.mockResolvedValue({ reply: "plain", tokens: { input: 1, output: 1 } });
  writeAnswerWithWalkthrough.mockResolvedValue({ reply: "rich", walkthrough, tokens: { input: 1, output: 1 } });
});

const onPage = (page: "home" | "forecast" | "other") => ({ page, units: [] as string[], branches: [] as string[] });

describe("answerWithDirectSql — walkthroughs on any page", () => {
  it("opens the forecast page when the answer is a forecast, even from the home page", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: onPage("forecast") }));
    const result = await answerWithDirectSql("forecast next months", { ...options, context: onPage("home"), scopeOptions });

    const [, , target, moved] = writeAnswerWithWalkthrough.mock.calls[0];
    expect(target).toMatchObject({ page: "forecast" });
    expect(moved).toBe(true);
    expect(result.scope).toMatchObject({ page: "forecast" });
  });

  it("does not move when the page that shows the answer is already open", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: onPage("forecast") }));
    await answerWithDirectSql("forecast next months", { ...options, context: onPage("forecast"), scopeOptions });

    expect(writeAnswerWithWalkthrough.mock.calls[0][3]).toBe(false);
  });

  it("opens the dashboard at the period asked about from a page with no panels (like reports)", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: dashboard({ periodStart: "202605", periodEnd: "202605", units: ["TP"] }) }));
    const result = await answerWithDirectSql("transport revenue may 2026", { ...options, context: onPage("other"), scopeOptions });

    expect(result.scope).toMatchObject({ page: "dashboard", periodStart: "202605", units: ["TP"] });
    expect(writeAnswerWithWalkthrough.mock.calls[0][3]).toBe(true);
  });

  it("opens another page with its defaults when the dashboard period is unusable", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: { page: "dashboard", units: [], branches: [] } }));
    const result = await answerWithDirectSql("walk me through", { ...options, context: onPage("forecast"), scopeOptions });

    expect(result.scope).toMatchObject({ page: "dashboard", units: [] });
    expect(writeAnswerWithWalkthrough.mock.calls[0][3]).toBe(true);
  });

  it("opens the dashboard when no page is named and the open page has nothing to point at", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: null }));
    const result = await answerWithDirectSql("who owes us the most", { ...options, context: onPage("other"), scopeOptions });

    expect(writeAnswer).not.toHaveBeenCalled();
    expect(writeAnswerWithWalkthrough.mock.calls[0][2]).toMatchObject({ page: "dashboard" });
    expect(writeAnswerWithWalkthrough.mock.calls[0][3]).toBe(true);
    expect(result.scope).toMatchObject({ page: "dashboard" });
  });

  it("still answers in plain text when no page context is sent at all (the evaluation runner)", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: null }));
    const result = await answerWithDirectSql("who owes us the most", { ...options, scopeOptions });

    expect(writeAnswer).toHaveBeenCalled();
    expect(result).toMatchObject({ walkthrough: null, scope: null });
  });

  it("keeps the open page when no page is named", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: null }));
    await answerWithDirectSql("anything", { ...options, context: onPage("home"), scopeOptions });

    expect(writeAnswerWithWalkthrough.mock.calls[0][2]).toMatchObject({ page: "home" });
    expect(writeAnswerWithWalkthrough.mock.calls[0][3]).toBe(false);
  });
});

describe("answerWithDirectSql — which dashboard the walkthrough is for", () => {
  it("moves the dashboard to the scope the question is about, and says so to Call 2", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: dashboard({ periodStart: "202605", periodEnd: "202605", units: ["TP"] }) }));
    const result = await answerWithDirectSql("transport revenue may 2026", { ...options, context: dashboard(), scopeOptions });

    const [, , target, moved] = writeAnswerWithWalkthrough.mock.calls[0];
    expect(target).toMatchObject({ periodStart: "202605", units: ["TP"] });
    expect(moved).toBe(true);
    expect(result.scope).toMatchObject({ periodStart: "202605", units: ["TP"] });
    expect(result.walkthrough).toEqual(walkthrough);
  });

  it("does not move it when the scope is what is already on screen", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: dashboard() }));
    await answerWithDirectSql("net profit june", { ...options, context: dashboard(), scopeOptions });

    expect(writeAnswerWithWalkthrough.mock.calls[0][3]).toBe(false);
  });

  it("ignores an invalid scope (a month with no data) and keeps the dashboard as it is", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: dashboard({ periodStart: "209901", periodEnd: "209901" }) }));
    const result = await answerWithDirectSql("q", { ...options, context: dashboard(), scopeOptions });

    expect(writeAnswerWithWalkthrough.mock.calls[0][2]).toMatchObject({ periodStart: "202606" });
    expect(writeAnswerWithWalkthrough.mock.calls[0][3]).toBe(false);
    expect(result.scope).toMatchObject({ periodStart: "202606" });
  });

  it("never moves the dashboard when it cannot check the scope against the data", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: dashboard({ periodStart: "202605", periodEnd: "202605" }) }));
    await answerWithDirectSql("q", { ...options, context: dashboard() });

    expect(writeAnswerWithWalkthrough.mock.calls[0][2]).toMatchObject({ periodStart: "202606" });
    expect(writeAnswerWithWalkthrough.mock.calls[0][3]).toBe(false);
  });

  it("returns no scope when there is no walkthrough, so nothing on the page changes", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: dashboard({ periodStart: "202605", periodEnd: "202605" }) }));
    writeAnswerWithWalkthrough.mockResolvedValueOnce({ reply: "rich", walkthrough: null, tokens: { input: 1, output: 1 } });
    const result = await answerWithDirectSql("q", { ...options, context: dashboard(), scopeOptions });

    expect(result.walkthrough).toBeNull();
    expect(result.scope).toBeNull();
  });

  it("uses the plain writer, and no scope, when the dashboard is not open", async () => {
    generateSql.mockResolvedValueOnce(plan({ scope: dashboard({ periodStart: "202605", periodEnd: "202605" }) }));
    const result = await answerWithDirectSql("q", { ...options, context: null, scopeOptions });

    expect(writeAnswer).toHaveBeenCalled();
    expect(writeAnswerWithWalkthrough).not.toHaveBeenCalled();
    expect(result).toMatchObject({ reply: "plain", walkthrough: null, scope: null });
  });

  it("does not answer, or move anything, for a refusal or a clarifying question", async () => {
    generateSql.mockResolvedValueOnce(plan({ supported: false, reason: "Out of scope.", queries: [] }));
    expect(await answerWithDirectSql("bitcoin?", { ...options, context: dashboard(), scopeOptions })).toMatchObject({ status: "declined", reply: "Out of scope." });

    generateSql.mockResolvedValueOnce(plan({ needsClarification: "What decreased?", queries: [] }));
    expect(await answerWithDirectSql("why?", { ...options, context: dashboard(), scopeOptions })).toMatchObject({ status: "clarify" });

    expect(writeAnswerWithWalkthrough).not.toHaveBeenCalled();
  });
});
