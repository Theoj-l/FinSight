import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const answerWithDirectSql = vi.fn();
const runReadOnly = vi.fn();
vi.mock("./pipeline", () => ({ answerWithDirectSql: (...args: unknown[]) => answerWithDirectSql(...args) }));
vi.mock("./run-readonly", () => ({ runReadOnly: (...args: unknown[]) => runReadOnly(...args) }));

const { answerChatQuestion, getLatestPeriod, resetLatestPeriodCache, todayInSingapore } = await import("./service");

const result = (over: Record<string, unknown> = {}) => ({ status: "answered", reply: "Hello", walkthrough: null, ...over });

beforeEach(() => {
  answerWithDirectSql.mockReset();
  runReadOnly.mockReset();
  resetLatestPeriodCache();
  runReadOnly.mockResolvedValue({ rows: [{ latest: 202608 }] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("answerChatQuestion", () => {
  it("returns the reply, and the walkthrough only when there is one", async () => {
    const walkthrough = { opening: "Look.", steps: [{ label: "filters", explanation: "Here." }] };
    answerWithDirectSql.mockResolvedValueOnce(result({ walkthrough }));
    expect(await answerChatQuestion("q", null)).toEqual({ status: 200, body: { reply: "Hello", walkthrough } });

    answerWithDirectSql.mockResolvedValueOnce(result());
    expect(await answerChatQuestion("q", null)).toEqual({ status: 200, body: { reply: "Hello" } });
  });

  it("passes the question, the newest month, the context and today's date to the pipeline", async () => {
    answerWithDirectSql.mockResolvedValueOnce(result());
    const context = { page: "dashboard" as const, periodStart: "202606", periodEnd: "202606", units: [], branches: [] };
    await answerChatQuestion("net profit?", context);

    const [question, options] = answerWithDirectSql.mock.calls[0];
    expect(question).toBe("net profit?");
    expect(options).toMatchObject({ latestPeriod: 202608, context });
    expect(options.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("treats a refusal and a clarifying question as normal replies", async () => {
    answerWithDirectSql.mockResolvedValueOnce(result({ status: "declined", reply: "Out of scope." }));
    expect(await answerChatQuestion("q", null)).toMatchObject({ status: 200, body: { reply: "Out of scope." } });
    answerWithDirectSql.mockResolvedValueOnce(result({ status: "clarify", reply: "What decreased?" }));
    expect(await answerChatQuestion("q", null)).toMatchObject({ status: 200, body: { reply: "What decreased?" } });
  });

  it("maps a pipeline error to 502 with a generic message", async () => {
    answerWithDirectSql.mockResolvedValueOnce(result({ status: "error", reply: "", detail: "Planning failed: boom" }));
    const out = await answerChatQuestion("q", null);
    expect(out.status).toBe(502);
    expect(out.body).toMatchObject({ error: "Chat request processing failed" });
  });

  it("maps a thrown error (for example the database being down) to 502", async () => {
    runReadOnly.mockRejectedValueOnce(new Error("connection refused"));
    expect(await answerChatQuestion("q", null)).toMatchObject({ status: 502, body: { error: "Chat request processing failed" } });
    expect(answerWithDirectSql).not.toHaveBeenCalled();
  });

  it("does not leak error details in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    answerWithDirectSql.mockResolvedValueOnce(result({ status: "error", reply: "", detail: "SELECT secret FROM x" }));
    const out = await answerChatQuestion("q", null);
    expect(JSON.stringify(out.body)).not.toContain("secret");
  });
});

describe("getLatestPeriod", () => {
  it("is cached for a while, then looked up again", async () => {
    expect(await getLatestPeriod(1_000)).toBe(202608);
    expect(await getLatestPeriod(2_000)).toBe(202608);
    expect(runReadOnly).toHaveBeenCalledTimes(1);
    await getLatestPeriod(1_000 + 11 * 60_000);
    expect(runReadOnly).toHaveBeenCalledTimes(2);
  });

  it("refuses a result that is not a month", async () => {
    runReadOnly.mockResolvedValueOnce({ rows: [{ latest: null }] });
    await expect(getLatestPeriod()).rejects.toThrow(/newest period/);
  });
});

describe("todayInSingapore", () => {
  it("uses Singapore's date, which is ahead of UTC", () => {
    expect(todayInSingapore(new Date("2026-10-21T20:00:00Z"))).toBe("2026-10-22");
    expect(todayInSingapore(new Date("2026-10-21T03:00:00Z"))).toBe("2026-10-21");
  });
});
