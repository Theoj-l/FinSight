import "server-only";
import { Prisma } from "@prisma/client";
import { readEvidence, type ChartAnomaly } from "./anomaly-evidence";
import { prisma } from "@/lib/db";
import { FIRST_ANOMALY_PERIOD, toAnomalyAlert, type AnomalyAlert, type AnomalyKind, type AnomalyLabels, type AnomalyStatus } from "./anomalies-utils";

export type { AnomalyAlert, AnomalyKind, AnomalyStatus };
export { ANOMALY_KIND_LABEL } from "./anomalies-utils";

export type AnomalyQuery = {
  /** Inclusive YYYYMM bounds; omit for every scored month. */
  periodStart?: number;
  periodEnd?: number;
  kinds?: AnomalyKind[];
  departmentIds?: string[];
};

/**
 * Current anomaly alerts, latest month first and highest score first within a
 * month. Reads the anomaly_alert table that ml-service keeps up to date; it
 * never calls the model, so it is as fast as any other dashboard query.
 */
export async function getAnomalyAlerts(query: AnomalyQuery = {}): Promise<AnomalyAlert[]> {
  const rows = await prisma.anomaly_alert.findMany({
    where: {
      period_no: { gte: query.periodStart, lte: query.periodEnd },
      ...(query.kinds ? { unit_kind: { in: query.kinds } } : {}),
      ...(query.departmentIds?.length ? { OR: [
        { unit_kind: "dept", unit_key: { in: query.departmentIds } },
        ...(query.departmentIds.includes("CP") ? [{ unit_kind: "acc", unit_key: { not: "" } }] : []),
      ] } : {}),
    },
    select: { unit_kind: true, unit_key: true, period_no: true, score: true, reasons: true, first_flagged_at: true, model_version: true },
    orderBy: [{ period_no: "desc" }, { score: "desc" }],
  });
  const keys = (kind: AnomalyKind) => [...new Set(rows.filter(row => row.unit_kind === kind).map(row => row.unit_key))];
  const [depts, accounts, customers] = await Promise.all([
    prisma.dept.findMany({ where: { dept_no: { in: keys("dept") } }, select: { dept_no: true, description: true } }),
    prisma.gl_mast.findMany({ where: { acc_no: { in: keys("acc") } }, select: { acc_no: true, description: true } }),
    prisma.debtor.findMany({ where: { acc_no: { in: keys("cust") } }, select: { acc_no: true, company_name: true } }),
  ]);
  const labels: AnomalyLabels = {
    dept: new Map(depts.map(row => [row.dept_no, row.description])),
    acc: new Map(accounts.map(row => [row.acc_no, row.description])),
    cust: new Map(customers.map(row => [row.acc_no, row.company_name])),
  };
  return rows.map(row => toAnomalyAlert(row, labels));
}

/** The latest successful scoring run: how fresh the alerts are. Null before the first run. */
export async function getAnomalyStatus(): Promise<AnomalyStatus | null> {
  const run = await prisma.anomaly_run.findFirst({ where: { status: "ok" }, orderBy: { run_id: "desc" } });
  if (!run) return null;
  return {
    scoredFrom: FIRST_ANOMALY_PERIOD,
    scoredAt: (run.finished_at ?? run.started_at).toISOString(),
    scoredThrough: run.scored_through,
    dataThrough: run.data_through,
    modelVersion: run.model_version,
    alertCount: run.n_alerts ?? 0,
  };
}

/** Read only the selected finding, excluding potentially large record snapshots. */
export async function getChartAnomaly(id: string, reason?: string): Promise<ChartAnomaly | null> {
  const parts = id.split(":");
  if (parts.length !== 3 || !["dept", "acc", "cust"].includes(parts[0]) || !/^\d{6}$/.test(parts[2])) return null;
  const [kind, key, month] = parts;
  const rows = await prisma.$queryRaw<Array<{ findings: unknown }>>(Prisma.sql`
    SELECT evidence->'findings' AS findings FROM anomaly_alert
    WHERE unit_kind = ${kind} AND unit_key = ${key} AND period_no = ${Number(month)}`);
  const evidence = readEvidence({ version: 1, asOf: "", records: {}, findings: rows[0]?.findings });
  const finding = evidence?.findings.find(f => f.code === reason && f.chart);
  if (!finding || kind !== "dept") return null;
  const alerts = await getAnomalyAlerts({ periodStart: Number(month), periodEnd: Number(month), kinds: ["dept"], departmentIds: [key] });
  const alert = alerts.find(a => a.id === id);
  return alert ? { alert, finding } : null;
}
