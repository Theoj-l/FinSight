import { sumComplete } from "./engine";
export type ForecastReferenceRow = {
  run_id: string;
  kind: string;
  dept_no: string;
  metric: string;
  origin: number;
  period_no: number;
  yhat: string;
  finished_at: string | null;
};
export function selectForecastReference(
  rows: ForecastReferenceRow[],
  departments: string[],
  period: number,
  metric: "revenue" | "netProfit",
) {
  const start = `${Math.floor(period / 100)}-${String(period % 100).padStart(2, "0")}-01T00:00:00.000Z`;
  const own = rows.filter(
    (r) =>
      r.metric === (metric === "netProfit" ? "profit" : "revenue") &&
      r.period_no === period &&
      r.origin < period,
  );
  const groups = new Map<string, ForecastReferenceRow[]>();
  for (const r of own) {
    if (typeof r.finished_at !== "string" || !Number.isFinite(new Date(r.finished_at).getTime())) continue;
    if (r.kind !== "forecast" && r.kind !== "backtest") continue;
    if (
      r.kind === "forecast" &&
      new Date(r.finished_at).getTime() >= new Date(start).getTime()
    )
      continue;
    const key = `${r.run_id}:${r.kind}:${r.origin}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const ordered = [...groups.values()].sort(
    (a, b) =>
      Number(a[0].kind === "backtest") - Number(b[0].kind === "backtest") ||
      b[0].origin - a[0].origin ||
      new Date(b[0].finished_at!).getTime() -
        new Date(a[0].finished_at!).getTime(),
  );
  for (const group of ordered) {
    const selected = departments.map((dept) =>
      group.filter((r) => r.dept_no === dept),
    );
    if (selected.some((rows) => rows.length !== 1)) continue;
    const r = group[0];
    return {
      value: sumComplete(selected.map((rows) => rows[0].yhat)),
      note: `${r.kind === "backtest" ? "Reconstructed forecast (rolling backtest), not an estimate issued at that time" : "Archived forecast issued before the target month"}; origin ${r.origin}; run ${r.run_id}; generated ${r.finished_at}. Estimates, not guarantees.`,
    };
  }
  return {
    value: null,
    note: `No complete, causal forecast is available for this business-unit selection and month. Missing or incompatible coverage: ${departments.filter(d => !ordered[0]?.some(r => r.dept_no === d)).join(", ") || departments.join(", ")}.`,
  };
}
