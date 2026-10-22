import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ alerts: vi.fn(), names: vi.fn(), status: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { anomaly_alert: { findMany: mocks.alerts }, anomaly_run: { findFirst: mocks.status }, dept: { findMany: mocks.names }, gl_mast: { findMany: mocks.names }, debtor: { findMany: mocks.names } } }));
import { getAnomalyAlerts, getAnomalyStatus } from "../data/anomalies";
beforeEach(() => { vi.resetAllMocks(); mocks.alerts.mockResolvedValue([]); mocks.names.mockResolvedValue([]); });
it("restricts unit selections and includes expense accounts only for Corporate", async () => {
  await getAnomalyAlerts({ periodStart: 202601, periodEnd: 202601, departmentIds: ["HL"] });
  expect(mocks.alerts.mock.calls[0][0].where.OR).toEqual([{ unit_kind: "dept", unit_key: { in: ["HL"] } }]);
  await getAnomalyAlerts({ departmentIds: ["CP"] });
  expect(mocks.alerts.mock.calls[1][0].where.OR).toEqual([{ unit_kind: "dept", unit_key: { in: ["CP"] } }, { unit_kind: "acc", unit_key: { not: "" } }]);
});
it("does not load large evidence blobs for alert previews", async () => {
  await getAnomalyAlerts();
  expect(mocks.alerts.mock.calls[0][0].select.evidence).toBeUndefined();
  expect(mocks.alerts.mock.calls[0][0].where.OR).toBeUndefined();
});
it("uses only successful scoring status", async () => {
  mocks.status.mockResolvedValue(null);
  expect(await getAnomalyStatus()).toBeNull();
  expect(mocks.status.mock.calls[0][0].where).toEqual({ status: "ok" });
});
