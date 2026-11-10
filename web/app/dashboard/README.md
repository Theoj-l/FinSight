# Dashboard reporting filters

The dashboard uses one URL-backed reporting scope: `period=YYYYMM`, optional
`unit=<dept_no>`, and optional `branch=<branch_code>`. A selection immediately
starts a server navigation. A loading overlay hides stale figures until the new
scope is ready. Browser history and copied URLs retain the selection.

- The reporting selector currently supports one month. The default is the latest
  valid PBalance month; a date range is not implemented.
- Product groups are accounting departments. All product groups omits the department
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
- Reset filters restores the latest month, All product groups and All Branches. Each
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

## Design language and shared pieces

- **Backdrop:** the look of the FinSight pitch film.
  - A pale lavender-to-rose vertical tint, navy light across the top of the content, and rose light down the right side.
  - The left edge stays neutral, so the frosted sidebar has no seam.
  - It is pure CSS gradients, with no image, fixed behind every page by `body::before` in `app/globals.css`.
  - Pages show it by leaving their own background transparent.
  - The old marble (`public/marble.webp`, rendered by `scripts/generate-marble.py`) now only gives the home page's dark hero card its faint texture.
- **Surfaces:** the `@utility` classes in `app/globals.css`.
  - `glass`: a frosted card for things that should float (headline cards, filter and comparison bars, the anomaly bar).
  - `glass-blur`: real backdrop blur. It re-blurs while scrolling, so it is only for things content slides behind: the expanded sidebar overlay and the mobile header.
  - `glass-rail`: the collapsed desktop sidebar. It is an 18% white veil with no border, so the backdrop flows through and the sidebar reads as part of the page.
  - `surface`: crisp white for charts, tables and forms.
  - Use glass sparingly.
- **Traffic lights:** `trafficLight()` in `lib/financial/traffic-light.ts` follows the Settings thresholds, the same rule as notifications.
  - Green = favourable or flat.
  - Amber = unfavourable but within the threshold, or alerts off.
  - Red = beyond the threshold.
  - With a 0% threshold any unfavourable change is red.
  - Show the label too (`StatusPill`), never colour alone.
- **Headline figures:** `HeadlineCard`, `RatioTile` and `AttentionSummary` in `app/components/financial/kpi-card.tsx` (Home snapshot and Dashboard overview).
  - Dollar figures lead, in whole units.
  - Every change says what it is against ("Up S$406,648 (+7.2%) vs Jul 2026 · S$5,622,515").
  - Ratios sit separately, with changes in percentage points.
  - *Total expenses* (cost of sales + operating expenses) is a display-only KPI from `totalExpensesComparison()`. It uses the stricter expense threshold and raises no notification of its own.
- **P&L month by month:** `lib/financial/pnl-months.ts` reads the months already in the comparison bundle (no extra query).
- **Anomalies:** `groupAnomalies()` and `describeMonths()` in `data/anomalies-utils.ts` list a unit once across months.
  - The panel also loads the 12 months before the period, to tag recurring units.
- **Ask the assistant:** `askAssistant(question)` / `<AskAssistantButton>` in `app/components/chat/ask-assistant.tsx` opens the chat and sends a question from anywhere in the app.
- **Layout:** card grids that sit beside the sidebar or the walkthrough gutter use container queries (`@container`, `@xl:` / `@5xl:`), so they reflow on the width they actually have.

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
- **Product groups filter.** Forecasts are stored per department. A selection of product groups
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
- **Anomalous months are left out (model v2).** The forecast ignores the months
  the anomaly model flagged, so a one-off event does not distort it. The run's
  `forecast_run.summary.anomaly_mask` lists them if you want to show which months
  were excluded.

### For the assistant (US3.7)

Add a `forecast` question type whose handler calls `getForecast(scope)` with
the units from the classification, and reads the month asked for from
`series[metric].forecast`. Using this same function keeps the answer identical
to the forecast view. The answer must state the forecast month, say it is a
projection, and quote the band and the accuracy when `meetsTarget` is false.
Map the assistant's metrics: `revenue` → `revenue`, `total_cost` → `cost`,
`net_profit` → `profit`.

### Anomaly review UI and evidence

Home delivers anomaly notifications for the latest successfully scored month,
using the existing per-account/browser notification preferences and history.
Dashboard shows a three-alert preview below the KPIs for its reporting scope.
Clearing Home notifications never removes dashboard findings. Department filters
include matching business-unit alerts and Corporate expense-account alerts when
`CP` is selected; customer alerts require company-wide scope. Branch anomaly
attribution is unavailable.

Expanding an alert lazily calls authenticated `GET /api/anomalies/:id`, with
optional `reason` and positive `page` parameters (20 records per page). The
stored alert owns the record scope; client-supplied financial filters cannot
change it. Evidence version 1 stores reason codes, comparisons, source IDs and
scoring-time record snapshots. Source existence is checked on read. Historical
customer balances use only receipts posted by the flagged month end, never the
current `outstanding` column. Related records are not individually classified
anomalies. Older alerts without evidence keep their reasons and show a notice.

Revenue and gross-margin findings link to the existing charts with `period`,
`unit`, `anomaly`, `reason` and, for gross margin, `profitMode=gross`. Links clear
branch selection. Charts highlight the flagged month and show the prior 12
calendar months, extended for findings using older history. Net/Gross selection
updates only the graph using the already loaded series and native browser history,
without server navigation or dashboard queries. The mode persists in the URL
and supports browser Back/Forward; switching to Net exits a gross anomaly comparison.
The model includes other income in its revenue/gross-margin definition, so its
additional series and comparison are explicitly labelled separately from the
standard accounting figures. Missing chart months remain gaps. Expense,
customer, reconciliation and new-account findings have no chart action.

For an existing database, apply **only** `prisma/anomaly-evidence.sql` (an
idempotent additive migration), then run `npm run db:pull` and
`npm run db:generate`. The complete `finsight_schema.sql` is for fresh setup;
its CREATE TABLE statements must not be rerun over an existing database.
Deploy the updated scorer and web reader, then run `python -m app.anomaly.score`
from ml-service to populate evidence. No training or model artifact update is
required. Failed scoring runs preserve the previous results.

Validation: `npm test`, `npm run typecheck`, `npm run lint`, and
`npm run test:anomalies:browser`. The browser suite mounts production components
with controlled router/auth/API fixtures; backend scope and authentication are
covered separately in route and data tests.
