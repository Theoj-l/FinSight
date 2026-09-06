"use client";

import { useState, useSyncExternalStore } from "react";
import { defaultThresholds, formatAmount, formatPercentage, needsAttention, outcome, validThresholds, type Change, type KpiData, type Thresholds } from "../data/kpi-presentation";

const colors = { favorable: "text-emerald-700", unfavorable: "text-red-700", neutral: "text-slate-500" };
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("kpi-settings", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("kpi-settings", callback); };
}
function Indicator({ change, unit }: { change: Change | null; unit: "money" | "ratio" }) {
  if (!change) return <span className="text-sm text-slate-500">Comparison unavailable</span>;
  const status = outcome(change.direction);
  const absolute = unit === "money" ? formatAmount(change.absolute, unit) : `${change.absolute.replace("-", "−")} pp`;
  return <div className={`flex flex-wrap items-center gap-1.5 text-sm font-medium ${colors[status]}`}>
    {change.direction !== 0 && <svg aria-label={change.direction > 0 ? "Increase" : "Decrease"} role="img" viewBox="0 0 12 12" className="h-3 w-3 shrink-0" fill="currentColor"><path d={change.direction > 0 ? "M6 1 12 11H0Z" : "M0 1h12L6 11Z"} /></svg>}
    <span>{change.direction > 0 ? "+" : ""}{absolute}</span>
    <span>({change.percentage === null ? "N/A · zero baseline" : formatPercentage(change.percentage)})</span>
    <span className="sr-only">{status === "neutral" ? "Unchanged" : status}</span>
  </div>;
}

export function KpiCards({ data, error, userId }: { data?: KpiData | null; error?: string; userId: string }) {
  const storageKey = `finsight:kpi-thresholds:v1:${userId}`;
  const raw = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(storageKey); } catch { return null; }
  }, () => null);
  let thresholds = defaultThresholds();
  try { const parsed: unknown = raw ? JSON.parse(raw) : null; if (validThresholds(parsed)) thresholds = parsed; } catch { /* Invalid saved settings fall back to defaults. */ }
  const [sessionSettings, setSessionSettings] = useState<Thresholds | null>(null);
  const [message, setMessage] = useState("");
  thresholds = sessionSettings ?? thresholds;

  if (error || !data) return <section aria-label="Financial overview" className="mt-8 rounded-xl border border-slate-200 p-6"><h2 className="font-semibold text-brand-navy">Financial overview</h2><p className="mt-2 text-muted">{error ?? "No PBalance data is available yet."}</p></section>;

  const alertValue = (metric: KpiData["metrics"][number]) => metric.id === "budgetVariance" ? metric.budgetComparison?.percentage : metric.change?.percentage;
  const flagged = data.metrics.filter(metric => needsAttention(alertValue(metric), thresholds[metric.id]));

  function persist(settings: Thresholds) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
      setSessionSettings(null);
      window.dispatchEvent(new Event("kpi-settings"));
      setMessage("Thresholds saved for your account in this browser.");
    } catch { setSessionSettings(settings); setMessage("Thresholds applied for this session. Browser storage is unavailable."); }
  }

  return <section aria-labelledby="kpi-heading" className="mt-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-brand-blue">TSH Energy · Financial performance</p><h2 id="kpi-heading" className="mt-1 text-xl font-semibold text-brand-navy">Financial overview</h2><p className="mt-1 text-sm text-muted">{data.period} · Monthly total · Compared with {data.priorPeriod} · SGD</p></div>
      <a href="#kpi-settings" className="flex items-center gap-2 rounded-lg border border-brand-navy/20 px-3 py-2 text-sm font-medium text-brand-navy" onClick={() => { const el = document.getElementById("kpi-settings"); if (el instanceof HTMLDetailsElement) el.open = true; }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5"><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-2Z" /><circle cx="12" cy="11" r="3" /></svg>
        Threshold settings
      </a>
    </div>
    {data.notices.length > 0 && <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-muted">{data.notices.map(notice => <p key={notice}>{notice}</p>)}</div>}
    <div role="status" className={`mt-4 rounded-lg border px-4 py-3 text-sm ${flagged.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-brand-blue/20 bg-brand-blue-light text-brand-navy"}`}>
      {flagged.length ? `Attention needed: ${flagged.map(metric => metric.label).join(", ")} outside your configured limits.` : "No calculable variances exceed your configured limits."}
    </div>
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {data.metrics.map(metric => {
        const attention = needsAttention(alertValue(metric), thresholds[metric.id]);
        return <article key={metric.id} className={`min-w-0 rounded-xl border border-t-4 bg-white p-5 shadow-sm ${attention ? "border-amber-300 border-t-amber-500" : "border-slate-200 border-t-brand-navy"} ${metric.unit === "ratio" ? "xl:col-span-2" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium text-muted">{metric.label}</h3>{attention && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Attention needed</span>}</div>
          <p className="my-3 break-words text-2xl font-semibold tabular-nums tracking-tight text-brand-navy">{metric.value === null ? "Unavailable" : formatAmount(metric.value, metric.unit)}</p>
          <Indicator change={metric.change} unit={metric.unit} />
          <p className="mt-1 text-xs text-muted">vs prior month{metric.prior !== null ? ` · ${formatAmount(metric.prior, metric.unit)}` : ""}</p>
          {metric.id === "budgetVariance" && <div className="mt-3 border-t border-slate-100 pt-3"><p className="mb-1 text-xs text-muted">Actual net profit vs budget</p><Indicator change={metric.budgetComparison ?? null} unit="money" /></div>}
          <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer">Calculation & alert basis</summary><p className="mt-2">{metric.description}</p><p className="mt-1">{metric.id !== "budgetVariance" && "Limits apply to percentage change versus the prior month. "}{thresholds[metric.id].enabled ? `Attention below ${thresholds[metric.id].min}% or above ${thresholds[metric.id].max}%.` : "Attention alerts disabled."}</p></details>
        </article>;
      })}
    </div>
    <p className="mt-3 text-xs text-muted">Green = favorable · Red = unfavorable · Triangles show numerical direction · Gray = unchanged. Percentage change uses the absolute prior value; pp = percentage points. An undefined percentage cannot trigger a percentage threshold.</p>
    <details id="kpi-settings" className="mt-5 rounded-xl border border-brand-navy/15 p-4">
      <summary className="cursor-pointer font-medium text-brand-navy">Configure attention thresholds</summary>
      <p className="mt-2 text-sm text-muted">Set an inclusive acceptable range for each variance. Defaults of 0% flag every nonzero variance. These limits control attention alerts; favorable and unfavorable colors always remain visible. Settings are saved per account in this browser.</p>
      <form key={JSON.stringify(thresholds)} className="mt-4" onSubmit={event => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const settings = defaultThresholds();
        for (const metric of data.metrics) {
          const min = Number(values.get(`${metric.id}-min`));
          const max = Number(values.get(`${metric.id}-max`));
          if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) { setMessage(`${metric.label}: minimum must not exceed maximum.`); return; }
          settings[metric.id] = { min, max, enabled: values.has(`${metric.id}-enabled`) };
        }
        persist(settings);
      }}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.metrics.map(metric => <fieldset key={metric.id} className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium">{metric.label}</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={`${metric.id}-enabled`} defaultChecked={thresholds[metric.id].enabled} />Enable attention alerts</label>
          <div className="mt-3 grid grid-cols-2 gap-3">{(["min", "max"] as const).map(bound => <label key={bound} className="text-xs text-muted">{bound === "min" ? "Minimum (%)" : "Maximum (%)"}<input required type="number" step="any" name={`${metric.id}-${bound}`} defaultValue={thresholds[metric.id][bound]} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm text-foreground" /></label>)}</div>
        </fieldset>)}</div>
        <div className="mt-4 flex flex-wrap gap-3"><button type="submit" className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy-dark">Save thresholds</button><button type="button" onClick={() => persist(defaultThresholds())} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Reset to 0%</button></div>
      </form>
      <p role="status" className="mt-3 text-sm text-brand-navy">{message}</p>
    </details>
  </section>;
}
