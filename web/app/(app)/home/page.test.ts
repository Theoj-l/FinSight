import { financialFixture } from "@/tests/fixtures/financial";
import { comparisonKpis } from "@/lib/financial/presentation";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getFinancialBundle: vi.fn(), getAnomalyStatus: vi.fn(), getAnomalyAlerts: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/financial/data", () => ({ getFinancialBundle: mocks.getFinancialBundle }));
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
  expect(mocks.getFinancialBundle).not.toHaveBeenCalled();
});

it("supplies the latest company-wide metrics and a retrieval timestamp", async () => {
  const bundle = financialFixture();
  const data = comparisonKpis(bundle, bundle.notificationSource);
  mocks.getFinancialBundle.mockResolvedValue(bundle);
  const page = await HomePage();
  expect(mocks.getFinancialBundle).toHaveBeenCalledWith();
  expect(page.props).toMatchObject({ userId: "user-1", data });
  expect(Number.isFinite(Date.parse(page.props.loadedAt))).toBe(true);
});

it("keeps navigation usable when the database fails without claiming a healthy status", async () => {
  mocks.getFinancialBundle.mockRejectedValue(new Error("database unreachable"));
  const page = await HomePage();
  expect(page.props).toMatchObject({ data: null, error: "Financial data could not be loaded. Refresh to try again." });
});

it("keeps anomaly notifications available when KPI loading fails", async () => {
  mocks.getFinancialBundle.mockRejectedValue(new Error("unavailable"));
  mocks.getAnomalyStatus.mockResolvedValue({ scoredThrough: 202608 });
  mocks.getAnomalyAlerts.mockResolvedValue([{ id: "acc:6900:202608" }]);
  const page = await HomePage();
  expect(mocks.getAnomalyAlerts).toHaveBeenCalledWith({ periodStart: 202608, periodEnd: 202608 });
  expect(page.props.anomalyResult.alerts).toHaveLength(1);
});
it("keeps KPI data available when anomaly loading fails", async () => {
  mocks.getFinancialBundle.mockResolvedValue(financialFixture());
  mocks.getAnomalyStatus.mockRejectedValue(new Error("unavailable"));
  const page = await HomePage();
  expect(page.props.data.period).toBe("2026-08");
  expect(page.props.anomalyResult.error).toContain("could not be loaded");
});
