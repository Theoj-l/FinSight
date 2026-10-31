"use client";
import { useEffect, useState } from "react";
import {
  defaultRules,
  METRICS,
  SOURCES,
  type Rules,
  type Source,
  type PeriodComparison,
} from "@/lib/financial/types";

type Metadata = {
  rules: Rules;
  notificationSource: Source;
  notificationBudgetId?: string | null;
  latestPeriod?: number;
  departments: { dept_no: string; description: string | null; segment?: string | null }[];
  accounts: {
    acc_no: string;
    description: string | null;
    acc_type: string | null;
  }[];
  budgets: { id: string; name: string }[];
  entries: Record<string, string>;
  manual: Record<string, string>;
  automatic: PeriodComparison | null;
  summary?: { units: string[]; auto: PeriodComparison | null; manual: PeriodComparison | null; budget: PeriodComparison | null } | null;
};
async function load(query = "", signal?: AbortSignal): Promise<Metadata> {
  const response = await fetch(`/api/financial-settings${query}`, {
    signal,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message ?? "Settings could not be loaded.");
  return data;
}
async function save(body: unknown) {
  const response = await fetch("/api/financial-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message ?? "Changes could not be saved.");
  return data.message as string;
}
const card =
  "scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
const input =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const button =
  "rounded-lg bg-brand-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
export function FinancialSettings() {
  const [data, setData] = useState<Metadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loaded = data !== null;
  useEffect(() => {
    if (
      !loaded ||
      !["#thresholds", "#budgets-forecasts"].includes(window.location.hash)
    )
      return;
    const section = document.getElementById(window.location.hash.slice(1));
    section?.scrollIntoView({ block: "start" });
    const heading = section?.querySelector("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [loaded]);
  useEffect(() => {
    const controller = new AbortController();
    load("", controller.signal)
      .then((data) => {
        setData(data);
        setError(null);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [attempt]);
  if (!data)
    return (
      <section id="thresholds" className={card}>
        <h2 className="font-semibold text-brand-navy">
          Threshold Settings / Budgets & Forecasts
        </h2>
        <p
          role={error ? "alert" : "status"}
          className="mt-3 text-sm text-muted"
        >
          {error ?? "Loading company financial settings…"}
        </p>
        {error && (
          <button
            className="mt-3 underline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry
          </button>
        )}
      </section>
    );
  return (
    <>
      {error && (
        <div role="alert" className="text-sm text-red-700">
          {error}{" "}
          <button
            className="underline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      )}
      <ThresholdEditor data={data} />
      <PlanningEditor data={data} refresh={() => setAttempt((n) => n + 1)} />
    </>
  );
}
function ThresholdEditor({ data }: { data: Metadata }) {
  const [rules, setRules] = useState(data.rules);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section id="thresholds" className={card}>
      <h2 className="font-semibold text-brand-navy">Threshold Settings</h2>
      <p className="mt-2 text-sm text-muted">
        Shared company rules used by KPI cards, matching chart comparisons, P&L
        rows and Home notifications. Only unfavorable deviations beyond the
        tolerance trigger attention. Margin/ratio tolerances measure relative
        percentage change, not percentage points.
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-brand-blue-light/50 px-3 py-2 text-xs text-brand-navy">
        <span className="font-semibold">Traffic lights:</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />Favourable</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-400" />Unfavourable, within the tolerance</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-red" />Beyond the tolerance</span>
        <span className="text-muted">With a 0% tolerance, any unfavourable change is red.</span>
      </p>
      <form
        className="mt-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            setMessage(await save({ kind: "rules", rules }));
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
          <legend className="sr-only">Financial deviation rules</legend>
          {Object.entries(METRICS).map(([key, metric]) => {
            const id = key as keyof Rules;
            return (
              <div key={id} className="rounded-lg border border-slate-200 p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={rules[id].enabled}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        [id]: { ...rules[id], enabled: e.target.checked },
                      })
                    }
                  />
                  {metric.label} alerts
                </label>
                <label className="mt-2 block text-xs text-muted">
                  Allowed unfavorable {metric.higher ? "decrease" : "increase"}{" "}
                  (%)
                  <input
                    required
                    aria-label={`${metric.label} tolerance (%)`}
                    className={input}
                    type="number"
                    min="0"
                    max="1000000"
                    step="any"
                    value={
                      Number.isNaN(rules[id].tolerance)
                        ? ""
                        : rules[id].tolerance
                    }
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        [id]: {
                          ...rules[id],
                          tolerance:
                            e.target.value === ""
                              ? NaN
                              : Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
            );
          })}
        </fieldset>
        <div className="mt-4 flex flex-wrap gap-3">
          <button disabled={busy} className={button}>
            {busy ? "Saving…" : "Save thresholds"}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() => {
              setRules(defaultRules());
              setMessage("Draft reset to 0%. Save thresholds to apply.");
            }}
          >
            Reset draft to 0%
          </button>
        </div>
        <p role="status" className="mt-3 text-sm text-brand-navy">
          {message}
        </p>
      </form>
    </section>
  );
}
function PlanningEditor({
  data,
  refresh,
}: {
  data: Metadata;
  refresh: () => void;
}) {
  const [department, setDepartment] = useState(
    "",
  );
  const [businessType, setBusinessType] = useState("");
  const current = data.latestPeriod
    ? `${Math.floor(data.latestPeriod / 100)}-${String(data.latestPeriod % 100).padStart(2, "0")}`
    : new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(current);
  const [budgetId, setBudgetId] = useState("");
  const [source, setSource] = useState(data.notificationSource);
  const [notificationBudgetId, setNotificationBudgetId] = useState(
    data.notificationBudgetId ?? "",
  );
  const [scenario, setScenario] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const perform = async (body: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      setMessage(await save(body));
      refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section id="budgets-forecasts" className={card}>
      <h2 className="font-semibold text-brand-navy">Budgets & Forecasts</h2>
      <p className="mt-2 text-sm text-muted">
        Company-wide plans and estimates, shared across browsers and charts.
        Budgets are agreed plans; manual forecasts are human estimates and never
        overwrite model predictions. Amounts are in SGD.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void perform({
            kind: "source",
            source,
            budgetId: notificationBudgetId || null,
          });
        }}
      >
        <label className="text-sm">
          Home notification comparison source
          <select
            aria-label="Home notification comparison source"
            className={input}
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
          >
            {Object.entries(SOURCES).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {source === "budget" && (
          <label className="text-sm">
            Home budget scenario
            <select
              aria-label="Home budget scenario"
              required
              className={input}
              value={notificationBudgetId}
              onChange={(e) => setNotificationBudgetId(e.target.value)}
            >
              <option value="">Choose the scenario for Home alerts</option>
              {data.budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button disabled={busy} className={button}>
          Save notification source
        </button>
      </form>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Business type<select className={input} value={businessType} onChange={e => { setBusinessType(e.target.value); setDepartment(""); }}><option value="">All business types</option><option>Machining</option><option>Bulk</option></select></label>
        <label className="text-sm">
          Business unit
          <select
            className={input}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">All business units</option>
            {data.departments.filter(d => !businessType || d.segment === businessType).map((d) => (
              <option key={d.dept_no} value={d.dept_no}>
                {d.description ?? d.dept_no} ({d.dept_no})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Reporting month
          <input
            className={input}
            type="month"
            required
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Budget scenario
          <select
            className={input}
            value={budgetId}
            onChange={(e) => setBudgetId(e.target.value)}
          >
            <option value="">Choose a scenario to edit budgets</option>
            {data.budgets.map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">
        Save edits before changing business unit, month or scenario. Unsaved drafts
        are discarded when the selection changes.
      </p>
      {/^\d{4}-\d{2}$/.test(month) && (
        <PlanningScope
          key={`${businessType}:${department}:${month}:${budgetId}`}
          businessType={businessType}
          data={data}
          department={department}
          period={Number(month.replace("-", ""))}
          budgetId={budgetId}
        />
      )}
      <form
        className="mt-6 flex flex-wrap items-end gap-3 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void perform({ kind: "scenario", name: scenario });
        }}
      >
        <label className="text-sm">
          New budget scenario name
          <input
            required
            maxLength={20}
            className={input}
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          />
        </label>
        <button disabled={busy} className={button}>
          Create budget scenario
        </button>
      </form>
      <p role="status" className="mt-3 text-sm text-brand-navy">
        {message}
      </p>
    </section>
  );
}
function PlanningScope({
  businessType,
  data,
  department,
  period,
  budgetId,
}: {
  data: Metadata;
  businessType: string;
  department: string;
  period: number;
  budgetId: string;
}) {
  const [result, setResult] = useState<Metadata | null>(null);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    const q = new URLSearchParams({ period: String(period) });
    if (department) q.set("department", department);
    if (businessType) q.set("businessType", businessType);
    if (budgetId) q.set("budgetId", budgetId);
    load(`?${q}`, c.signal)
      .then((r) => {
        setResult(r);
        setEntries(r.entries);
        setManual(r.manual);
      })
      .catch((e) => {
        if (!c.signal.aborted) setMessage(e.message);
      });
    return () => c.abort();
  }, [businessType, department, period, budgetId, attempt]);
  const perform = async (body: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      setMessage(await save(body));
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!result)
    return (
      <div className="mt-4">
        <p role="status" className="text-sm text-muted">
          {message || "Loading this business unit’s plans…"}
        </p>
        {message && (
          <button
            className="underline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry
          </button>
        )}
      </div>
    );
  if (!department) return <div className="mt-6 space-y-4"><h3 className="font-semibold">{businessType || "All business units"} · calculated summary</h3><p className="text-sm text-muted">Read-only totals for {result.summary?.units.join(", ") || "no active units"}. Select one business unit to edit its plans.</p>{(["budget", "auto", "manual"] as const).map(source => <section key={source} className="rounded-lg bg-slate-50 p-4"><h4 className="font-semibold">{SOURCES[source]}</h4>{(["revenue", "netProfit"] as const).map(metric => <p key={metric} className="mt-2 text-sm">{METRICS[metric].label}: {result.summary?.[source]?.metrics[metric].reference ?? "Unavailable"} SGD</p>)}<p className="mt-2 text-xs text-muted">{result.summary?.[source]?.provenance.join(" ") || "Choose a budget scenario or reporting month."}</p></section>)}</div>;
  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-lg bg-slate-50 p-4">
        <h3 className="text-sm font-semibold">
          Auto forecast · read-only estimate
        </h3>
        {(["revenue", "netProfit"] as const).map((metric) => (
          <div key={metric} className="mt-2 text-sm">
            <p>
              {METRICS[metric].label}:{" "}
              {result.automatic?.metrics[metric].reference ?? "Unavailable"} SGD
            </p>
            <details className="mt-1 text-xs text-muted">
              <summary className="cursor-pointer">
                Origin and limitations
              </summary>
              {result.automatic?.metrics[metric].note}
              <p>
                Estimates, not guarantees.{" "}
                <a href="/forecast" className="underline">
                  View forecast accuracy and outcome ranges
                </a>
                .
              </p>
            </details>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void perform({
            kind: "manual",
            department,
            period,
            revenue: manual.revenue?.trim() || null,
            netProfit: manual.netProfit?.trim() || null,
          });
        }}
      >
        <h3 className="text-sm font-semibold">Manual forecast</h3>
        <p className="mt-1 text-xs text-muted">
          Blank values clear the saved estimate. Zero is an explicit estimate.
          Company totals require estimates for every selected business unit.
        </p>
        <fieldset disabled={busy} className="mt-3 grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Human forecast estimates</legend>
          {(["revenue", "netProfit"] as const).map((metric) => (
            <label key={metric} className="text-sm">
              {METRICS[metric].label} (SGD)
              <input
                type="number"
                step="0.0001"
                className={input}
                value={manual[metric] ?? ""}
                onChange={(e) =>
                  setManual({ ...manual, [metric]: e.target.value })
                }
              />
            </label>
          ))}
        </fieldset>
        <button disabled={busy} className={`${button} mt-3`}>
          Save manual forecast
        </button>
        <button
          type="button"
          disabled={busy}
          className="ml-3 text-sm underline"
          onClick={async () => {
            if (
              await perform({
                kind: "manual",
                department,
                period,
                revenue: null,
                netProfit: null,
              })
            )
              setManual({});
          }}
        >
          Clear manual forecast
        </button>
      </form>
      {budgetId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform({
              kind: "budget",
              department,
              period,
              budgetId,
              entries: data.accounts.map((a) => ({
                account: a.acc_no,
                amount: entries[a.acc_no]?.trim() || null,
              })),
            });
          }}
        >
          <h3 className="text-sm font-semibold">Budget account amounts</h3>
          <p className="mt-1 text-xs text-muted">
            Enter revenue/income and expense amounts using their displayed sign.
            Profit and margins are derived. Blank removes that account’s budget;
            zero means explicitly budgeted zero. Complete profit budgets need
            operating revenue, cost of sales, other income and operating
            expenses, with explicit zeros where appropriate. Saving replaces
            only this business unit/month/scenario.
          </p>
          <fieldset
            disabled={busy}
            className="mt-3 max-h-96 overflow-y-auto rounded border p-3"
          >
            <legend className="sr-only">Budget account components</legend>
            {data.accounts.map((a) => (
              <label
                key={a.acc_no}
                className="mb-3 grid items-center gap-2 text-sm sm:grid-cols-[1fr_160px]"
              >
                <span>
                  {a.acc_no} · {a.description} ({a.acc_type})
                </span>
                <input
                  aria-label={`Budget ${a.acc_no}`}
                  type="number"
                  step="0.0001"
                  className={input}
                  value={entries[a.acc_no] ?? ""}
                  onChange={(e) =>
                    setEntries({ ...entries, [a.acc_no]: e.target.value })
                  }
                />
              </label>
            ))}
          </fieldset>
          <button disabled={busy} className={`${button} mt-3`}>
            Save budget
          </button>
        </form>
      )}
      <p role="status" className="text-sm text-brand-navy">
        {message}
      </p>
    </div>
  );
}
