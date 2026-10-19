"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageLoading } from "@/app/components/page-loading";
import { BRANCH_LEDGER_MESSAGE, type FilterOptions, type FilterSelection } from "../data/dashboard-scope";
import { formatPeriod } from "../data/revenue-expense-utils";

export function DashboardFilters({ options, selection, error, destination = "/dashboard", hidePeriod = false, children }: { options: FilterOptions; selection: FilterSelection; error?: string; destination?: string; hidePeriod?: boolean; children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(selection);
  const [periodMode, setPeriodMode] = useState<"month" | "range">(selection.periodStart === selection.periodEnd ? "month" : "range");
  const [openMenu, setOpenMenu] = useState<"units" | "branches" | null>(null);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(selection) || (periodMode === "range") !== (selection.periodStart !== selection.periodEnd);

  function applyFilters() {
    const query = new URLSearchParams();
    for (const key of ["comparison", "budgetId"]) { const value = searchParams.get(key); if (value) query.set(key, value); }
    if (destination === "/dashboard" && searchParams.get("profitMode") === "gross") query.set("profitMode", "gross");
    if (!hidePeriod && draft.periodStart) query.set("periodStart", draft.periodStart);
    if (!hidePeriod && draft.periodEnd) query.set("periodEnd", periodMode === "range" ? draft.periodEnd : draft.periodStart);
    if (draft.businessType) query.set("businessType", draft.businessType);
    draft.units.forEach(unit => query.append("unit", unit));
    draft.branches.forEach(branch => query.append("branch", branch));
    startTransition(() => router.push(`${destination}?${query}`, { scroll: false }));
  }
  function resetDraft() {
    const defaultPeriod = String(options.defaultPeriod ?? options.periods[0] ?? "");
    setDraft(current => ({ periodStart: hidePeriod ? current.periodStart : defaultPeriod, periodEnd: hidePeriod ? current.periodEnd : defaultPeriod, units: [], branches: [] }));
    setPeriodMode("month");
    setOpenMenu(null);
  }
  function toggleValue(key: "units" | "branches", value: string) {
    setDraft(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value] }));
  }
  function selectedLabel(values: string[], allLabel: string) {
    if (values.length === 0) return allLabel;
    if (values.length === 1) return values[0];
    return `${values.length} selected`;
  }
  const style = "mt-1 w-full rounded-lg border border-brand-navy/20 bg-white px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-brand-blue";
  const periodLabel = !selection.periodStart || error ? "Unavailable" : selection.periodStart === selection.periodEnd ? formatPeriod(Number(selection.periodStart)) : `${formatPeriod(Number(selection.periodStart))} to ${formatPeriod(Number(selection.periodEnd))}`;
  return <>
    <section aria-label="Dashboard filters" className="mt-6 rounded-xl border border-brand-navy/15 bg-brand-blue-light/60 p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-brand-navy">Reporting scope</h2>
          <p className="mt-1 text-sm text-muted">Configure your filters, then apply them to refresh the dashboard.</p>
        </div>
        <button type="button" onClick={resetDraft} className="rounded-lg border border-brand-navy/20 bg-white px-3 py-2 text-sm font-medium text-brand-navy" disabled={pending}>Clear</button>
      </div>
      <fieldset disabled={pending} className={`grid gap-4 md:grid-cols-2 ${hidePeriod ? "xl:grid-cols-2" : "xl:grid-cols-4"} disabled:opacity-60`}>
        <legend className="sr-only">Reporting scope</legend>
        {!hidePeriod && <div className="md:col-span-2">
          <div className="mb-1 flex items-center justify-between"><span className="text-sm font-medium text-brand-navy">Period</span><span className="text-xs text-muted">{periodMode === "month" ? "Specific month" : "Date range"}</span></div>
          <div className="flex rounded-lg border border-brand-navy/20 bg-white p-1" role="group" aria-label="Period selection mode">
            <button type="button" onClick={() => { setPeriodMode("month"); setDraft(current => ({ ...current, periodEnd: current.periodStart })); }} className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${periodMode === "month" ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-blue-light"}`}>Specific month</button>
            <button type="button" onClick={() => setPeriodMode("range")} className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${periodMode === "range" ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-blue-light"}`}>Date range</button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="sr-only" htmlFor="period-start">{periodMode === "month" ? "Month" : "Range start"}</label>
            <select id="period-start" className={style} value={draft.periodStart} disabled={!options.periods.length} onChange={event => setDraft(current => ({ ...current, periodStart: event.target.value, periodEnd: periodMode === "month" ? event.target.value : current.periodEnd }))}>
              {options.periods.map(period => <option key={period} value={period}>{formatPeriod(period)}</option>)}
            </select>
            {periodMode === "range" && <><label className="sr-only" htmlFor="period-end">Range end</label><select id="period-end" className={style} value={draft.periodEnd} disabled={!options.periods.length} onChange={event => setDraft(current => ({ ...current, periodEnd: event.target.value }))}>
              {options.periods.map(period => <option key={period} value={period}>{formatPeriod(period)}</option>)}
            </select></>}
          </div>
        </div>}
        <label className="text-sm font-medium text-brand-navy">Business type<select className={style} value={draft.businessType ?? ""} onChange={event => { const businessType = event.target.value; setDraft(current => ({ ...current, businessType, units: current.units.filter(code => !businessType || options.units.some(u => u.code === code && u.businessType === businessType)) })); }}><option value="">All business types</option><option>Machining</option><option>Bulk</option></select></label>
        <MultiSelect label="Business units" values={draft.units} options={options.units.filter(u => !draft.businessType || u.businessType === draft.businessType)} open={openMenu === "units"} onToggle={() => setOpenMenu(openMenu === "units" ? null : "units")} onChange={value => toggleValue("units", value)} buttonLabel={selectedLabel(draft.units, "All business units")} />
        <MultiSelect label="Branches" values={draft.branches} options={options.branches} open={openMenu === "branches"} onToggle={() => setOpenMenu(openMenu === "branches" ? null : "branches")} onChange={value => toggleValue("branches", value)} buttonLabel={selectedLabel(draft.branches, "All branches")} />
      </fieldset>
      <p id="branch-coverage" className="mt-3 text-xs text-muted">Business units use the accounting unit codes. Branch filtering currently applies to invoice revenue; ledger and budget branch attribution is not available.</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-brand-navy/10 pt-4">
        <p role="status" className="text-sm text-brand-navy">{hidePeriod ? "Using latest closed actuals and the current forecast run" : `Applied: ${periodLabel}`} · {selection.businessType || "All business types"} · {selection.units.length || "All"} unit{selection.units.length === 1 ? "" : "s"} · {selection.branches.length || "All"} branche{selection.branches.length === 1 ? "" : "s"}</p>
        <button type="button" onClick={applyFilters} disabled={pending || !isDirty} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50">Apply Filters</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-brand-red">{error} <button className="underline" onClick={() => startTransition(() => router.refresh())}>Retry</button></p>}
      {!error && selection.branches.length > 0 && <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{BRANCH_LEDGER_MESSAGE}</p>}
    </section>
    <div aria-busy={pending} className="relative">
      {pending && <PageLoading />}
      <div className={pending ? "pointer-events-none select-none opacity-60" : undefined} aria-hidden={pending || undefined}>{children}</div>
    </div>
  </>;
}

function MultiSelect({ label, values, options, open, onToggle, onChange, buttonLabel }: { label: string; values: string[]; options: { code: string; label: string }[]; open: boolean; onToggle: () => void; onChange: (value: string) => void; buttonLabel: string }) {
  const style = "mt-1 w-full rounded-lg border border-brand-navy/20 bg-white px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:outline-2 focus:outline-brand-blue";
  return <div className="relative">
    <span className="text-sm font-medium text-brand-navy">{label}</span>
    <button type="button" className={`${style} flex items-center justify-between text-left`} aria-haspopup="listbox" aria-expanded={open} onClick={onToggle}><span className="truncate">{buttonLabel}</span><span className="ml-2 text-muted" aria-hidden="true">{open ? "^" : "v"}</span></button>
    {open && <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-brand-navy/15 bg-white p-2 shadow-lg" role="listbox" aria-label={label} aria-multiselectable="true">
      {options.map(option => <label key={option.code} className="flex cursor-pointer items-start gap-2 rounded px-2 py-2 text-sm hover:bg-brand-blue-light"><input type="checkbox" checked={values.includes(option.code)} onChange={() => onChange(option.code)} className="mt-0.5 accent-brand-blue" /><span>{option.label}</span></label>)}
      {options.length === 0 && <span className="block px-2 py-2 text-sm text-muted">No options available</span>}
    </div>}
  </div>;
}
