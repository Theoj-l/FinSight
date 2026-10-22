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
