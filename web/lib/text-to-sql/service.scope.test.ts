import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TourScript } from "../../app/components/tour/tour-script";

const answerWithDirectSql = vi.fn();
const runReadOnly = vi.fn();
vi.mock("./pipeline", () => ({ answerWithDirectSql: (...args: unknown[]) => answerWithDirectSql(...args) }));
vi.mock("./run-readonly", () => ({ runReadOnly: (...args: unknown[]) => runReadOnly(...args) }));

const { answerChatQuestion, getScopeOptions, resetLatestPeriodCache } = await import("./service");

const dashboard = { page: "dashboard" as const, periodStart: "202606", periodEnd: "202606", units: [] as string[], branches: [] as string[] };
const walkthrough: TourScript = { opening: "Look.", steps: [{ label: "filters", explanation: "Here." }] };

beforeEach(() => {
  answerWithDirectSql.mockReset();
  runReadOnly.mockReset();
  resetLatestPeriodCache();
  runReadOnly.mockImplementation(async (sql: string) => {
    if (sql.includes("max(period_no)")) return { rows: [{ latest: 202608 }] };
    if (sql.includes("distinct period_no")) return { rows: [{ period_no: 202605 }, { period_no: 202606 }] };
    if (sql.includes("from dept")) return { rows: [{ dept_no: "CP" }, { dept_no: "TP" }] };
    if (sql.includes("from branch")) return { rows: [{ branch_code: "KL" }] };
    return { rows: [] };
  });
});

describe("getScopeOptions", () => {
  it("reads the months, departments and branches that exist, and caches them", async () => {
    expect(await getScopeOptions(1_000)).toEqual({ periods: [202605, 202606], units: ["CP", "TP"], branches: ["KL"] });
    await getScopeOptions(2_000);
    expect(runReadOnly).toHaveBeenCalledTimes(3);
  });
});

describe("answerChatQuestion — scope", () => {
  it("passes what exists in the data to the pipeline only when the dashboard is open", async () => {
    answerWithDirectSql.mockResolvedValue({ status: "answered", reply: "ok", walkthrough: null, scope: null });

    await answerChatQuestion("q", dashboard);
    expect(answerWithDirectSql.mock.calls[0][1].scopeOptions).toEqual({ periods: [202605, 202606], units: ["CP", "TP"], branches: ["KL"] });

    answerWithDirectSql.mockClear();
    await answerChatQuestion("q", null);
    expect(answerWithDirectSql.mock.calls[0][1]).not.toHaveProperty("scopeOptions");
  });

  it("returns the scope together with the walkthrough", async () => {
    const scope = { ...dashboard, periodStart: "202605", periodEnd: "202605", units: ["TP"] };
    answerWithDirectSql.mockResolvedValueOnce({ status: "answered", reply: "ok", walkthrough, scope });

    expect(await answerChatQuestion("q", dashboard)).toEqual({ status: 200, body: { reply: "ok", walkthrough, scope } });
  });

  it("never returns a scope without a walkthrough, so the page does not change for nothing", async () => {
    answerWithDirectSql.mockResolvedValueOnce({ status: "answered", reply: "ok", walkthrough: null, scope: dashboard });

    expect(await answerChatQuestion("q", dashboard)).toEqual({ status: 200, body: { reply: "ok" } });
  });
});
