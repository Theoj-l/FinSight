# Dashboard reporting filters

The dashboard uses one URL-backed reporting scope: `period=YYYYMM`, optional
`unit=<dept_no>`, and optional `branch=<branch_code>`. A selection immediately
starts a server navigation. A loading overlay hides stale figures until the new
scope is ready. Browser history and copied URLs retain the selection.

- The reporting selector currently supports one month. The default is the latest
  valid PBalance month; a date range is not implemented.
- Business units are accounting departments. All units omits the department
  predicate; selecting one applies it to balances, budgets and invoice lines.
- Every monthly chart and KPI uses the selected month. KPI and expense-category
  comparisons use the preceding calendar month within the same unit. P&L YTD is
  January through the selected month, within that unit.
- The profit year-over-year comparison uses the three calendar months ending at
  the selected end month and compares them with the same three months one year
  earlier. It uses net profit = revenue + other income - cost of sales -
  operating expenses. Missing ledger months remain unavailable rather than
  being treated as zero; totals and percentage changes are withheld when the
  comparison is incomplete.
- Invoice revenue uses document dates from the first day of the month inclusive
  to the first day of the next month exclusive, and excludes cancelled invoices.
  It is an invoice-based measure and need not reconcile to ledger revenue where
  journals, timing or coverage differ.
- Filter values are validated against database options on the server. Invalid
  selections do not run financial queries or silently fall back to all data.
- Reset filters restores the latest month, All units and All Branches. Each
  individual all option resets only its own dimension.

## Branch coverage and outstanding dependency

The present schema records branch on invoices, but not on PBalance,
BudgetPBalance, GL details or departments. Selecting a branch filters product
group invoice revenue. Ledger panels display an explicit unavailable message;
they never display unfiltered totals under a branch selection.

Full branch financial reporting requires either authoritative branch attribution
on ledger and budget rows or a verified exclusive department-to-branch mapping
(including historical validity, if assignments change). Do not infer an expense
or budget allocation from the branches appearing on sales invoices. Once a
mapping exists, resolve its department scope before all ledger reads and remove
the corresponding UI coverage limitation.

## Thresholds

Revenue, gross profit, net profit, budget variance, gross margin, net margin and
operating expense ratio have configurable inclusive lower and upper bounds.
Bounds default to zero, so every calculable nonzero variance triggers attention.
Profit, margin and expense-ratio limits apply to relative percentage change from
the prior month; budget variance limits apply to actual net profit versus budget.
Operating expense ratio = EX / RE × 100, excluding cost of sales. Lower is better.
Margin and expense-ratio thresholds measure relative changes, not target levels.

Settings persist per user in the current browser and survive filter changes.
Existing six-metric settings are preserved when expense ratio is introduced.
Missing or zero baselines with nonzero current values have no calculable percent
and cannot trigger percentage limits. Alert color represents business outcome;
arrow direction represents mathematical change.

Budget values require one scenario per month. Alternative scenarios are never
summed. Missing or ambiguous P&L budgets render unavailable rather than zero.

## Verification

Run `npm test`, `npm run lint`, and `npx tsc --noEmit` from `web/`.
`npm run build -- --webpack` provides a production build where Turbopack's worker
port is restricted. Tests cover URL validation, all/default behavior, composed
query scopes, date boundaries, YTD scope, comparison scope, missing/ambiguous
budgets, unsupported branch attribution and threshold migration.

## Anomaly alerts

`data/anomalies.ts` reads the alerts that ml-service stores in `anomaly_alert`.
It never calls the model, so it costs the same as any other dashboard query.

```ts
import { getAnomalyAlerts, getAnomalyStatus } from "@/app/dashboard/data/anomalies";

const alerts = await getAnomalyAlerts({ periodStart: 202601, periodEnd: 202608 });
const status = await getAnomalyStatus();   // null before the first scoring run
```

Each alert is one flagged unit-month:

| Field | Meaning |
|---|---|
| `id` | `kind:unitKey:periodNo`. Stable across rescoring, so it can key notifications. |
| `kind` | `dept` business unit, `acc` corporate expense account, `cust` customer (`ANOMALY_KIND_LABEL` has display names) |
| `unitKey`, `unitLabel` | the code and its name, e.g. `HL` / Heavy Lift & Haulage |
| `periodNo` | flagged month, YYYYMM |
| `score` | model probability, 0–1. Every stored alert is already above the threshold; use it for ordering or emphasis, not to re-filter. |
| `reasons` | plain-English evidence, strongest first. Show as-is. |
| `firstFlaggedAt` | when the alert first appeared |

- Only closed months are scored. Months after `status.scoredThrough` are
  provisional; show them as "not yet checked", never as "no anomalies".
- `status.scoredAt` says how fresh the alerts are. Alerts change only when the
  ledger is rescored (after a data load, a nightly run, or
  `mlClient.rescoreAnomalies()`), so they are safe to cache with the page.
- An alert can disappear after a rescore if new data explains it.

## Forecasts

`data/forecast.ts` reads the revenue, cost and net-profit forecasts that
ml-service stores in `forecast_run` / `forecast_value` (one run a month, after
month end). Like the anomaly alerts, it never calls the model.

```ts
import { getForecast, getForecastStatus } from "@/app/dashboard/data/forecast";

const data = await getForecast(scope);      // the dashboard's DashboardScope; null before the first run
const status = await getForecastStatus();   // freshness only
```

`getForecast(scope)` returns `{ status, units, series: { revenue, cost, profit } }`.
Each series has:

| Field | Meaning |
|---|---|
| `history` | Actuals per month, `{ periodNo, actual }`, up to `status.historyThrough`. Same definitions as the KPIs. |
| `forecast` | `{ periodNo, horizon, value, low, high }` for the months after `historyThrough` (12 by default). `low`/`high` is the 80% band: the range 80% of past forecasts at the same horizon landed in. |
| `pastForecasts` | `{ periodNo, forecast, actual }`: what was forecast one month ahead for each shown past month, next to what happened. Use it to compare projections against actuals. |
| `accuracy` | `{ months, mape, wape, mae, targetMape, meetsTarget }` for 1-month-ahead forecasts over the last 12 closed months, **for this unit selection**. |

`status` has `forecastAt`, `historyThrough`, `dataThrough`, `horizon`,
`modelVersion`, `method` and `targetMape` (15).

### Rules

- **Always label forecast values as projections.** Draw them distinctly from
  actuals (dashed line or a shaded band), and say which month they start from:
  "Forecast from Aug 2026 data".
- **Show the accuracy, and disclose a miss (US3.5).** When
  `accuracy.meetsTarget` is false, say so next to the chart. For example:
  "Net profit forecasts have been off by 18% on average over the last 12 months,
  above the 15% reliability target. Treat as indicative." Show the band too.
  `meetsTarget` is null when there is no backtest yet; say "accuracy not yet
  measured".
- **Units filter.** Forecasts are stored per department. A selection of units
  is the sum of its departments, exactly like the actuals, so every filter adds
  up. **Branch filter:** forecasts come from the ledger, so a branch selection
  throws `BRANCH_LEDGER_MESSAGE`, like the other ledger panels.
- **Period filter.** A range selection sets where `history` starts. A single
  month shows the trailing 24 months (`{ historyMonths }` to change). The
  forecast itself always starts after the latest closed month.
- **Profit is derived:** revenue − cost + other income, from the same model, so
  revenue − cost always reconciles with the profit shown. Business-unit
  profit is gross profit, because all overhead sits in `CP` (Corporate).
- **Freshness.** Forecasts change only when ml-service runs: the monthly cron,
  after a `datagen --load`, or `mlClient.runForecast()`. They are safe to cache
  with the page.

### For the assistant (US3.7)

Add a `forecast` question type whose handler calls `getForecast(scope)` with
the units from the classification, and reads the month asked for from
`series[metric].forecast`. Using this same function keeps the answer identical
to the forecast view. The answer must state the forecast month, say it is a
projection, and quote the band and the accuracy when `meetsTarget` is false.
Map the assistant's metrics: `revenue` → `revenue`, `total_cost` → `cost`,
`net_profit` → `profit`.
