"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BRANCH_LEDGER_MESSAGE, type FilterOptions, type FilterSelection } from "../data/dashboard-scope";
import { formatPeriod } from "../data/revenue-expense-utils";

export function DashboardFilters({ options, selection, error, children }: { options: FilterOptions; selection: FilterSelection; error?: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(selection);
  function navigate(next: FilterSelection) {
    setDraft(next);
    const query = new URLSearchParams();
    if (next.period) query.set("period", next.period);
    if (next.unit) query.set("unit", next.unit);
    if (next.branch) query.set("branch", next.branch);
    startTransition(() => router.push(`/dashboard?${query}`, { scroll: false }));
  }
  const style = "mt-1 w-full rounded-lg border border-brand-navy/20 bg-white px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-brand-blue";
  return <>
    <section aria-label="Dashboard filters" className="mt-6 rounded-xl border border-brand-navy/15 bg-brand-blue-light/60 p-4">
      <fieldset disabled={pending} className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4 disabled:opacity-60">
        <legend className="sr-only">Reporting scope</legend>
        <label className="text-sm font-medium text-brand-navy">Reporting month
          <select className={style} value={draft.period} disabled={!options.periods.length} onChange={event => navigate({ ...draft, period: event.target.value })}>
            {!options.periods.includes(Number(draft.period)) && <option value={draft.period}>Choose a reporting month</option>}
            {options.periods.map(p => <option key={p} value={p}>{formatPeriod(p)}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-brand-navy">Business unit
          <select className={style} value={draft.unit} onChange={event => navigate({ ...draft, unit: event.target.value })}>
            <option value="">All units</option>
            {draft.unit && !options.units.some(u => u.code === draft.unit) && <option value={draft.unit}>Unavailable unit</option>}
            {options.units.map(u => <option key={u.code} value={u.code}>{u.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-brand-navy">Branch
          <select aria-describedby="branch-coverage" className={style} value={draft.branch} onChange={event => navigate({ ...draft, branch: event.target.value })}>
            <option value="">All Branches</option>
            {draft.branch && !options.branches.some(b => b.code === draft.branch) && <option value={draft.branch}>Unavailable branch</option>}
            {options.branches.map(b => <option key={b.code} value={b.code}>{b.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => navigate({ period: String(options.periods[0] ?? ""), unit: "", branch: "" })} className="rounded-lg border border-brand-navy/20 bg-white px-3 py-2 text-sm font-medium text-brand-navy">Reset filters</button>
      </fieldset>
      <p id="branch-coverage" className="mt-3 text-xs text-muted">Business units use the accounting department codes. Branch filtering currently applies to invoice revenue; ledger and budget branch attribution is not available.</p>
      <p role="status" className="mt-2 text-sm text-brand-navy">{pending ? "Updating all dashboard figures…" : `${formatPeriod(Number(selection.period))} · ${options.units.find(u => u.code === selection.unit)?.label ?? "All units"} · ${options.branches.find(b => b.code === selection.branch)?.label ?? "All Branches"}`}</p>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-brand-red">{error}</p>}
      {!error && selection.branch && <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{BRANCH_LEDGER_MESSAGE}</p>}
    </section>
    <div aria-busy={pending} className="relative">
      {pending && <div className="absolute inset-0 z-10 bg-white/80"><p className="sticky top-4 rounded-lg bg-brand-blue-light p-4 text-center font-medium text-brand-navy">Loading the selected reporting scope…</p></div>}
      <div inert={pending} aria-hidden={pending || undefined}>{children}</div>
    </div>
  </>;
}
