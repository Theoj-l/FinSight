import "server-only";
import { prisma } from "@/lib/db";
import { toAnomalyAlert } from "./anomalies-utils";
import { readEvidence, type AlertDetails } from "./anomaly-evidence";

export async function getAlertDetails(id: string, reason: string | null, page: number): Promise<AlertDetails | null> {
  const [kind, key, month] = id.split(":");
  const row = await prisma.anomaly_alert.findUnique({ where: { unit_kind_unit_key_period_no: { unit_kind: kind, unit_key: key, period_no: Number(month) } } });
  if (!row) return null;
  const alert = toAnomalyAlert(row, { dept: new Map(), acc: new Map(), cust: new Map() });
  const evidence = readEvidence(row.evidence);
  const finding = evidence?.findings.find(f => f.code === reason) ?? (!reason ? evidence?.findings[0] : undefined) ?? null;
  if (reason && evidence && !finding) throw new RangeError("Unknown evidence reason");
  const refs = finding?.refs ?? [];
  const pages = Math.max(1, Math.ceil(refs.length / 20));
  const activePage = Math.min(page, pages);
  const records = refs.slice((activePage - 1) * 20, activePage * 20).map(ref => evidence?.records[ref]).filter(r => !!r);
  // Verify source existence, but display the scoring-time snapshot, especially
  // for historical receivables. Never substitute today's outstanding balance.
  const ids = (source: string) => records.filter(r => r.source === source).map(r => BigInt(r.id));
  const [gl, ar, iv] = await Promise.all([
    prisma.gl_dtl.findMany({ where: { gl_dtl_key: { in: ids("ledger") } }, select: { gl_dtl_key: true } }),
    prisma.ar_invoice.findMany({ where: { doc_key: { in: ids("invoice") } }, select: { doc_key: true } }),
    prisma.iv.findMany({ where: { doc_key: { in: ids("sales_invoice") } }, select: { doc_key: true } }),
  ]);
  const exists = new Set([...gl.map(r => `ledger:${r.gl_dtl_key}`), ...ar.map(r => `invoice:${r.doc_key}`), ...iv.map(r => `sales_invoice:${r.doc_key}`)]);
  const available = records.filter(r => exists.has(`${r.source}:${r.id}`));
  return { alert, finding, findings: evidence?.findings ?? [], records: available, total: refs.length, page: activePage, pages, asOf: evidence?.asOf,
    missing: records.length - available.length + refs.slice((activePage - 1) * 20, activePage * 20).filter(ref => !evidence?.records[ref]).length,
    ...(!evidence ? { notice: "Detailed evidence is unavailable for this older alert. It will become available after the next scoring run." } : {}) };
}
