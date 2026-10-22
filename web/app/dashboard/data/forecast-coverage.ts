import type { ForecastRow } from "./forecast-utils";
export function aggregateForecastRows(values: (ForecastRow & {dept_no: string})[], units: string[]) {
  const groups = new Map<string, (ForecastRow & {dept_no: string})[]>();
  for (const row of values) {
    const key = [row.kind,row.metric,row.origin,row.period_no,row.horizon].join(":");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const rows: ForecastRow[] = [], missing = new Set<string>();
  for (const group of groups.values()) {
    const selected = units.map(unit => group.filter(r => r.dept_no === unit));
    selected.forEach((r,i) => { if (r.length !== 1 || !Number.isFinite(r[0].yhat) || (r[0].kind === "backtest" && r[0].actual === null)) missing.add(units[i]); });
    if (!units.length || selected.some(r => r.length !== 1 || !Number.isFinite(r[0].yhat) || (r[0].kind === "backtest" && r[0].actual === null))) continue;
    rows.push({...group[0], yhat: selected.reduce((sum,r) => sum+r[0].yhat,0), actual: selected.some(r => r[0].actual === null) ? null : selected.reduce((sum,r) => sum+r[0].actual!,0)});
  }
  if (!values.length) units.forEach(u => missing.add(u));
  return {rows, missing: [...missing].sort()};
}
