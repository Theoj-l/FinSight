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
