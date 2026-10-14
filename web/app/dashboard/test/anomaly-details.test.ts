import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ alert: vi.fn(), gl: vi.fn(), ar: vi.fn(), iv: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { anomaly_alert: { findUnique: mocks.alert }, gl_dtl: { findMany: mocks.gl }, ar_invoice: { findMany: mocks.ar }, iv: { findMany: mocks.iv } } }));
import { getAlertDetails } from "../data/anomaly-details";
const row = { unit_kind: "acc", unit_key: "6900", period_no: 202608, score: .9, reasons: ["Unusual spending"], model_version: "v1", first_flagged_at: new Date(), evidence: null as unknown };
beforeEach(() => { vi.resetAllMocks(); mocks.alert.mockResolvedValue(row); mocks.gl.mockResolvedValue([]); mocks.ar.mockResolvedValue([]); mocks.iv.mockResolvedValue([]); });
it("keeps older alerts readable without claiming records exist", async () => {
  const result = await getAlertDetails("acc:6900:202608", null, 1);
  expect(result?.notice).toContain("older alert");
  expect(result?.alert.reasons).toEqual(row.reasons);
  expect(result?.records).toEqual([]);
});
it("paginates stored references, serializes IDs, and reports missing sources", async () => {
  const records = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`ledger:${i + 1}`, { id: String(i + 1), source: "ledger", home_dr: 50, dept_no: "CP" }]));
  const finding = { code: "expense_outlier", text: "Unusual spending", refs: Object.keys(records), chart: null };
  mocks.alert.mockResolvedValue({ ...row, evidence: { version: 1, asOf: "2026-08-31", findings: [finding], records } });
  mocks.gl.mockResolvedValue([{ gl_dtl_key: BigInt(21) }]);
  const result = await getAlertDetails("acc:6900:202608", "expense_outlier", 2);
  expect(result?.records).toEqual([records["ledger:21"]]);
  expect(result?.pages).toBe(2);
  expect(mocks.gl).toHaveBeenCalledWith({ where: { gl_dtl_key: { in: [BigInt(21)] } }, select: { gl_dtl_key: true } });
  mocks.gl.mockResolvedValue([]);
  expect((await getAlertDetails("acc:6900:202608", null, 2))?.missing).toBe(1);
  expect((await getAlertDetails("acc:6900:202608", null, 99))?.page).toBe(2);
});
it("retains scoring-time historical balances instead of today's invoice snapshot", async () => {
  const invoice = { id: "9007199254740993", source: "invoice", outstanding_as_of: 100, paid_as_of: 0 };
  mocks.alert.mockResolvedValue({ ...row, evidence: { version: 1, asOf: "2026-08-31", findings: [{ code: "overdue_invoices", refs: ["invoice:9007199254740993"] }], records: { "invoice:9007199254740993": invoice } } });
  mocks.ar.mockResolvedValue([{ doc_key: BigInt("9007199254740993") }]);
  expect((await getAlertDetails("cust:C01:202608", null, 1))?.records[0]).toEqual(invoice);
});
it("rejects unknown reason selection and handles a disappeared alert", async () => {
  mocks.alert.mockResolvedValue({ ...row, evidence: { version: 1, asOf: "2026-08-31", findings: [], records: {} } });
  await expect(getAlertDetails("acc:6900:202608", "invented", 1)).rejects.toThrow(RangeError);
  mocks.alert.mockResolvedValue(null);
  expect(await getAlertDetails("acc:6900:202608", null, 1)).toBeNull();
});
