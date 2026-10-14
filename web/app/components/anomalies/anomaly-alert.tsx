"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ANOMALY_KIND_LABEL, type AnomalyAlert as Alert } from "@/app/dashboard/data/anomalies-utils";
import { anomalyChartHref, comparisonText, type AlertDetails, type EvidenceRecord } from "@/app/dashboard/data/anomaly-evidence";
import { reportingMonth } from "@/app/home/overview-data";
import { formatPeriod } from "@/app/dashboard/data/revenue-expense-utils";

export function AnomalyAlert({ alert }: { alert: Alert }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  return <details className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-4" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-semibold text-brand-navy focus-visible:outline-2 focus-visible:outline-brand-blue">
      {alert.unitLabel}<span className="mt-1 block text-xs font-normal text-muted">{ANOMALY_KIND_LABEL[alert.kind]} · {reportingMonth(formatPeriod(alert.periodNo))} · Anomaly detected</span>
    </summary>
    {open && <div className="mt-4 space-y-3">
      <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">{alert.reasons.length ? alert.reasons.map((r, i) => <li key={i}>{r}</li>) : <li>Unusual combination of model signals; review related records.</li>}</ul>
      <EvidenceRequest key={`${alert.id}:${reason}:${page}`} alert={alert} reason={reason} page={page} onReason={value => { setReason(value); setPage(1); }} onPage={setPage} />
    </div>}
  </details>;
}

function EvidenceRequest({ alert, reason, page, onReason, onPage }: { alert: Alert; reason: string | null; page: number; onReason: (reason: string) => void; onPage: (page: number) => void }) {
  const [result, setResult] = useState<AlertDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page) });
    if (reason) query.set("reason", reason);
    fetch(`/api/anomalies/${encodeURIComponent(alert.id)}?${query}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Evidence could not be loaded.");
      if (!controller.signal.aborted) { setResult(data); setError(null); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [alert.id, reason, page, attempt]);
  if (error) return <div role="alert" className="text-sm text-red-700">{error}<button className="ml-3 underline" onClick={() => setAttempt(n => n + 1)}>Retry</button></div>;
  if (!result) return <p role="status" className="text-sm text-muted">Loading evidence…</p>;
  const finding = result.finding;
  const href = finding && anomalyChartHref(alert, finding);
  return <div className="space-y-3">
    {result.notice && <p role="status" className="text-sm text-muted">{result.notice}</p>}
    {result.findings.length > 1 && <label className="block text-sm font-medium text-brand-navy">Evidence for reason<select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" value={finding?.code ?? ""} onChange={e => onReason(e.target.value)}>{result.findings.map(f => <option key={f.code} value={f.code}>{f.text}</option>)}</select></label>}
    {finding && <>
      <p className="text-sm text-slate-700">{finding.text}</p>
      {(finding.comparison.actual !== null || finding.comparison.label) && <p className="text-sm font-medium text-brand-navy">{comparisonText(finding)}</p>}
      {href && <Link className="inline-block text-sm font-semibold text-brand-blue underline" href={href}>View comparison in chart →</Link>}
      <h4 className="text-sm font-semibold text-brand-navy">{finding.recordLabel} ({result.total})</h4>
      <p className="text-xs text-muted">Evidence as of {result.asOf}. {finding.recordLabel === "Related records" && "These records contribute to the pattern; they were not individually flagged."} Amounts in SGD.</p>
      {result.missing > 0 && <p role="status" className="text-sm text-amber-900">{result.missing} source records on this page are no longer available.</p>}
      <RecordsTable records={result.records} />
      <nav aria-label="Evidence pagination" className="flex flex-wrap items-center gap-3 text-sm">
        <button className="rounded border px-3 py-1 disabled:opacity-40" disabled={result.page <= 1} onClick={() => onPage(result.page - 1)}>Previous</button>
        <span aria-live="polite">Page {result.page} of {result.pages}</span>
        <button className="rounded border px-3 py-1 disabled:opacity-40" disabled={result.page >= result.pages} onClick={() => onPage(result.page + 1)}>Next</button>
      </nav>
    </>}
  </div>;
}

const columns = {
  ledger: [["trans_date", "Posting date"], ["ref_no1", "Reference"], ["gl_trx_id", "Journal"], ["acc_no", "Account"], ["dept_no", "Business unit"], ["description", "Description"], ["home_dr", "Debit (SGD)"], ["home_cr", "Credit (SGD)"], ["group", "Possible duplicate group"]],
  invoice: [["doc_no", "Invoice"], ["debtor_code", "Customer"], ["doc_date", "Issue date"], ["due_date", "Due date"], ["local_net_total", "Amount (SGD)"], ["paid_as_of", "Paid as of month end"], ["outstanding_as_of", "Outstanding as of month end"], ["overdue_days", "Overdue days (wholly unpaid)"]],
  sales_invoice: [["doc_no", "Invoice"], ["doc_date", "Issue date"], ["unit_amount", "Selected unit revenue (SGD)"], ["local_ex_tax", "Whole invoice revenue (SGD)"]],
};
function RecordsTable({ records }: { records: EvidenceRecord[] }) {
  if (!records.length) return <p className="text-sm text-muted">No source records are available on this page.</p>;
  return <div className="space-y-4">{(["ledger", "invoice", "sales_invoice"] as const).map(source => {
    const rows = records.filter(r => r.source === source);
    if (!rows.length) return null;
    const fields = columns[source].filter(([key]) => key !== "group" || rows.some(r => r.group));
    return <div key={source} className="overflow-x-auto rounded border border-slate-200 bg-white" tabIndex={0} role="region" aria-label={`${source === "ledger" ? "Ledger postings" : "Invoices"} evidence`}>
      <table className="w-full text-left text-xs"><caption className="p-2 text-left font-semibold">{source === "ledger" ? "Ledger postings" : source === "invoice" ? "Customer invoices" : "Sales invoices"}</caption><thead><tr>{fields.map(([key, label]) => <th scope="col" key={key} className="whitespace-nowrap border-b p-2">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>{fields.map(([key]) => <td key={key} className="whitespace-nowrap border-b border-slate-100 p-2">{typeof row[key] === "number" ? row[key].toLocaleString("en-SG", { maximumFractionDigits: 2 }) : row[key] ?? "—"}</td>)}</tr>)}</tbody>
      </table>
    </div>;
  })}</div>;
}
