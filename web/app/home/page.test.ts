import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getKpiData: vi.fn(), getAnomalyStatus: vi.fn(), getAnomalyAlerts: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/app/dashboard/data/kpi", () => ({ getKpiData: mocks.getKpiData }));
vi.mock("@/app/dashboard/data/anomalies", () => ({ getAnomalyStatus: mocks.getAnomalyStatus, getAnomalyAlerts: mocks.getAnomalyAlerts }));
import HomePage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAnomalyStatus.mockResolvedValue(null);
  mocks.getAnomalyAlerts.mockResolvedValue([]);
  mocks.requireUser.mockResolvedValue({ id: "user-1", email: "finance@example.com" });
});

it("authenticates before loading company financials", async () => {
  mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT:/login?next=/home"));
  await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.requireUser).toHaveBeenCalledWith("/home");
  expect(mocks.getKpiData).not.toHaveBeenCalled();
});

it("supplies the latest company-wide metrics and a retrieval timestamp", async () => {
  const data = { period: "2026-08", priorPeriod: "2026-07", metrics: [], notices: [] };
  mocks.getKpiData.mockResolvedValue(data);
  const page = await HomePage();
  expect(mocks.getKpiData).toHaveBeenCalledWith();
  expect(page.props.children.props).toMatchObject({ userId: "user-1", data });
  expect(Number.isFinite(Date.parse(page.props.children.props.loadedAt))).toBe(true);
});

it("keeps navigation usable when the database fails without claiming a healthy status", async () => {
  mocks.getKpiData.mockRejectedValue(new Error("database unreachable"));
  const page = await HomePage();
  expect(page.props.children.props).toMatchObject({ data: null, error: "Financial data could not be loaded. Refresh to try again." });
});

it("keeps anomaly notifications available when KPI loading fails", async () => {
  mocks.getKpiData.mockRejectedValue(new Error("unavailable"));
  mocks.getAnomalyStatus.mockResolvedValue({ scoredThrough: 202608 });
  mocks.getAnomalyAlerts.mockResolvedValue([{ id: "acc:6900:202608" }]);
  const page = await HomePage();
  expect(mocks.getAnomalyAlerts).toHaveBeenCalledWith({ periodStart: 202608, periodEnd: 202608 });
  expect(page.props.children.props.anomalyResult.alerts).toHaveLength(1);
});
it("keeps KPI data available when anomaly loading fails", async () => {
  mocks.getKpiData.mockResolvedValue({ period: "2026-08" });
  mocks.getAnomalyStatus.mockRejectedValue(new Error("unavailable"));
  const page = await HomePage();
  expect(page.props.children.props.data.period).toBe("2026-08");
  expect(page.props.children.props.anomalyResult.error).toContain("could not be loaded");
});
