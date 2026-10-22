# Financial comparisons: implementation and test report

Date: 18 October 2026. Compared with the clean starting commit `fe8ad16`.

The feature is implemented locally. The additive database upgrade is applied to
the database configured in `web/.env`, and Prisma was introspected and regenerated.
No application was deployed or published. All final checks listed below passed.

## 1. What this means for someone using FinSight

There is now one dashboard-wide **Compare against** choice. It answers:
“Which number should we compare this month's actual result with?”

| Choice | The comparison number |
| --- | --- |
| Default — Previous month | The previous calendar month's actual result. January uses December of the previous year. |
| Budget | A manually agreed financial plan for the same department(s) and month, using one budget scenario. |
| Auto forecast | A stored model estimate for that month. Initially available for operating revenue and final profit. |
| Manual forecast | An estimate explicitly entered by a person for operating revenue or final profit. |

Changing this choice updates the comparison figures in the cards, supported
charts and P&L. It does not change the ledger amounts. The comparison source and
budget scenario are stored in the URL. Refresh and browser Back/Forward retain
the chosen view. The existing Net/Gross switch also updates locally. Browser
checks confirmed no new requests or dashboard router navigation during source
and Net/Gross switching.

To configure the system:

1. Open **Settings → Threshold Settings**. Set each metric's allowed unfavorable
   deviation and enable/disable its alerts. Click **Save thresholds**. Reset changes
   the draft to 0%; it takes effect only after saving.
2. Open **Settings → Budgets & Forecasts**. Select a department and reporting month.
   Choose a scenario to edit account budgets, or create a named scenario.
3. Enter budget amounts against the existing accounts. Totals are calculated.
   For a complete profit budget, populate operating revenue, cost of sales,
   other income and operating expenses. Use explicit zero amounts when needed.
4. Enter, change or clear manual revenue/profit forecasts. Blank clears a saved
   estimate; `0` is a real estimate. Save before changing department/month/scenario.
5. Separately save the source used for **Home notifications**. If using Budget,
   select Home's budget scenario. Changing a dashboard dropdown does not change
   this saved policy.

Already-open pages use their loaded snapshot. Refresh/revisit them after saving
Settings to obtain the new values. Saves explain this in their confirmation.

## 2. Before and after

| Area | Before (`fe8ad16`) | After |
| --- | --- | --- |
| Comparison basis | KPI prior-month changes and a separate budget variance; P&L used budgets independently. | One selected source supplies the same references and calculations throughout supported views. Initial source is previous month. |
| Thresholds | Edited inline on Dashboard, stored per browser/account, with separate min/max checks. | Shared database rules: one nonnegative unfavorable-deviation tolerance and enable switch per metric, managed in Settings. |
| Favorable changes | Presentation/threshold helpers could evaluate both sides of the configured range. | Favorable movement stays visible and never creates a financial attention alert. |
| KPI cards | Seven cards, including a standalone Budget Variance card. | Six cards. Net-profit comparison contains the relevant budget deviation; no conflicting duplicate budget-variance rule. |
| Charts | Actual chart data and anomaly overlays, plus the local Net/Gross switch. | Existing chart areas gain matching reference series; unsupported breakdowns explain their actual-only coverage. No new graphs. |
| Source switching | No global source selector. | Preloaded source data; native URL history updates the client views without rerunning unrelated server queries. |
| P&L | Month actual, YTD and month budget, using the legacy format/subtotal helper. | Month Actual, YTD Actual, Selected Comparison and Variance %. Component rows and calculated income/profit subtotals use the shared engine. |
| Budget editing | Existing database budget tables, without this centralized planning editor. | Department/month/scenario account editor reuses those tables. Saves are atomic and limited to the selected scope. |
| Manual forecasts | No separate persistent human forecast structure. | Separate database records for department/month/revenue or net profit; editing them does not overwrite model results. |
| Historical model comparisons | No unified dashboard comparison policy. | Prefer complete archived forecasts issued before the target month; explicitly label causal rolling backtests as reconstructed. |
| Home financial alerts | Prior-month/browser-threshold inputs. | Saved company notification source, shared rules and references, stable issue IDs; local delivery/history behavior retained. |
| Future periods | Dashboard options came from actual ledger months. | Stored planned/forecast months are selectable. Missing actuals and actual-based variances remain unavailable; default month stays the latest actual. |
| Failure handling | Existing independent financial/anomaly loading. | This separation remains, plus a failed budget/manual/auto feed does not remove available actuals or previous-month comparisons. |

### A deliberate P&L correction

The old P&L's format-driven gross-profit subtotal included other income, whereas
the existing KPI and gross-profit chart excluded it. The shared P&L now uses:

```
Gross profit = operating revenue − cost of sales
Net profit   = operating revenue − cost of sales + other income − operating expenses
```

For example, revenue 100, cost of sales 30, other income 5 and expenses 20 gives
gross profit **70** and net profit **55**. The old P&L could show gross profit
**75** for that structure. This corrects a displayed subtotal; stored actual
ledger data is unchanged. The anomaly model's own accounting basis and scores
remain unchanged, and its chart evidence retains its separate labels.

## 3. How the rules work, with examples

```
Variance % = (actual − reference) ÷ absolute(reference) × 100
```

The calculation uses decimal arithmetic before converting values for display.
Amounts are displayed to two decimals without losing large integer precision.
Ratio/margin deviations are relative percentage changes, not percentage points.

| Example, with a 10% tolerance | Result |
| --- | --- |
| Revenue 89 versus 100 | −11%; unfavorable; attention/notification. |
| Revenue 90 versus 100 | −10%; exactly at the tolerance; no breach. |
| Revenue 150 versus 100 | +50%; favorable; no attention. |
| Expenses 111 versus 100 | +11%; unfavorable; attention. |
| Expenses 50 versus 100 | −50%; favorable; no attention. |
| Profit −120 versus −100 | −20%; the loss worsened; attention. |
| Profit −50 versus −100 | +50%; the loss improved; no attention. |
| Margin 18% versus 20% | −10% relative change; not “−2%”. |
| Actual 10 versus reference 0 | Absolute difference exists, percentage unavailable, no percentage breach. |
| Actual 0 versus reference 0 | 0% variance; no breach. |
| Missing actual/reference | Unavailable; no fabricated zero, fallback or percentage alert. |
| Rule disabled | Movement remains visible, but no attention/notification. |

Missing budget components keep dependent subtotals unavailable. Missing selected
departments keep the corresponding aggregate comparison unavailable. Ratios are
recalculated from totals rather than averaged across departments. Gross margin
is unavailable when operating revenue is nonpositive; zero revenue also leaves
the other revenue-denominated ratios unavailable.

## 4. Data, access and migration

`web/prisma/financial-comparison.sql` is the additive, repeatable upgrade. The same
definitions are included in `finsight_schema.sql` for fresh databases.

Added:

- `financial_settings`: singleton shared rules, Home notification source, optional
  selected budget-scenario key, and updated-by/time metadata.
- `financial_manual_forecast`: department/month/metric key, exact decimal amount,
  and updated-by/time metadata. Department foreign key and metric/month checks.
- Row-level security on both new tables, following the existing privileged-server
  database access pattern. Authenticated server routes enforce application access.

Reused `budget`, `budget_pbalance`, the account master, ledger balances, stored
forecast runs/values and stored anomaly alerts. Budget income is converted between
its database debit/credit sign and the sign shown in Settings. No budget scenarios
are added together. Duplicate scenario names are rejected by the writer, and
scenario-key allocation is serialized with a transaction advisory lock.

The new `GET`/`PUT /api/financial-settings` routes require a signed-in user, validate
inputs, return string IDs and use `private, no-store`. Missing/stale scopes produce
clear errors. Internal database errors are not returned to the browser. There is
no new role system; access remains authenticated and company-wide.

Money validation allows at most 15 integer digits and 4 decimal places; blank
values are sent as null. It rejects exponents, nonfinite values, malformed months,
duplicate account inputs, unsupported source names and invalid rules. A stale
account list is rejected before replacing a budget. Multi-row saves use transactions.

Applied successfully to the configured database, then ran:

```bash
cd web
npm run db:pull
npm run db:generate
```

For another existing environment, apply only the additive file first:

```bash
cd web
npm run db:apply -- prisma/financial-comparison.sql
npm run db:pull
npm run db:generate
```

Do not replay the full fresh-database schema over an existing database. The
`db-apply.mjs` command now accepts a SQL-file argument for this purpose. No
application deployment or publishing was performed.

## 5. Verification results

Baseline web verification passed **243 tests**, TypeScript, and lint with **0
errors / 8 existing warnings** before edits.

| Final check | Command / method | Result |
| --- | --- | --- |
| Web unit/integration suite | `npm test --prefix web` | **347 passed**, 41 files; 104 more tests than baseline. |
| Browser component integration | `npm run test:anomalies:browser --prefix web` | **9 passed**, Chromium; desktop and 390px mobile. |
| Real database integration | `npm run verify:financial:db --prefix web` | **9 passed**; all test writes rolled back. |
| Python regression suite | From `ml-service`: `venv/bin/python -m pytest tests -q -m 'not slow'` | **104 passed**, 1 slow test deselected. |
| Python slow smoke test | `venv/bin/python -m pytest tests/test_anomaly_smoke.py -q` | **1 passed**; temporary train/evaluate artifacts only. Combined Python total: **105 passed**. |
| TypeScript | `npm run typecheck --prefix web` | Passed, no errors. |
| ESLint | `npm run lint --prefix web` | Passed, **0 errors / the same 8 pre-existing warnings**. |
| Production build | From `web`: `npm run build -- --webpack` | Passed, including generated Prisma client, TypeScript, page generation and build traces. |
| Production HTTP smoke | Started the build locally on port 4176, checked HTTP responses, then stopped it. | **7 passed**: health/login 200; Home/Dashboard/Settings redirect to login; settings GET/PUT return 401 and no-store without authentication. |
| Whitespace | `git diff --check` | Passed. |
| Visual review | Inspected desktop/mobile Settings screenshots from the browser run. | Controls fit, labels readable, tables/long account lists scroll within their containers. |

Run the production build before the focused browser command, sequentially. An
intermediate rerun exposed a harness dependency: rebuilding concurrently could
remove its CSS and cause two mobile-width failures. The harness now requires
compiled styles instead of silently using minimal styling; the final styled
browser run passed all nine checks. Intermediate lint findings in new test/script
code were also corrected before the final clean-error lint run.

### Edge cases actually covered

- All four sources and identical scoped references across cards, P&L, chart
  projection helpers and Home financial alerts.
- January/December boundaries; relative margin changes; decimal rounding and
  amounts beyond JavaScript's safe integer limit; exact threshold boundaries.
- Favorable movements, disabled alerts, zero/zero, nonzero/zero, negative profit,
  missing actuals, missing references and invalid/nonpositive gross-margin revenue.
- Missing department actuals/plans; incomplete budget components; explicit
  Corporate zero budgets; future months; no substituted manual/auto values.
- Multiple scenarios kept separate; saved Home scenario; large IDs serialized
  safely; stale scopes/account lists; duplicate scenario names; scoped atomic saves.
- Forecast selection prefers archived genuine estimates, labels backtests,
  refuses same-month origins, invalid timestamps, duplicate coverage and mixed
  or incomplete run/department coverage. No invented gross-profit/OPEX forecast.
- Shared rule validation, invalid amounts, malformed JSON, missing authentication,
  private error handling, and corrupt persisted rules.
- Budget/manual/auto feed failures preserve actuals/default comparisons;
  Home's financial and anomaly feed failures remain independent.
- Financial alert identity changes with period, source, actual/reference or rule;
  cleared identical issues remain cleared; changed references become new issues.
  Existing delivery tests cover immediate/daily/weekly timing, pause and clearing.
- Browser source changes, scenario choice, refresh, Back/Forward, invalid URLs,
  saved Home policy remaining independent, and no requests/router navigation
  during comparison/Net-Gross changes.
- Settings input/save/clear, failed clear retaining the draft, load failure/retry,
  direct-link heading focus and mobile overflow.
- Existing anomaly expansion and lazy records, Next-page loading without remounting
  its explanation/table, failed page retry, chart links and scope, Gross selection,
  focus/highlights, mixed notifications, clearing and retained dashboard findings.
- Python causal forecasting, series/metrics/method/run behavior, anomaly scoring,
  labels, evidence, unchanged evidence-enrichment scores and training smoke behavior.

### Real database safety check

The integration script loads the production TypeScript data/write modules and
binds them to one real database transaction. It temporarily saves rules, manual
forecasts, a test scenario/budget and Home policy, reads them back, verifies
subtotals and scope, then deliberately rolls back. Afterwards it compares row
counts **and content fingerprints** for these ten tables with their pre-test
snapshots:

`pbalance`, `gl_dtl`, `budget`, `budget_pbalance`, `forecast_run`, `forecast_value`,
`anomaly_run`, `anomaly_alert`, `financial_settings`, `financial_manual_forecast`.

All matched. This verifies that test data and pre-existing plans/settings were
restored, rather than merely checking that a write method was called. No ML
source files or retained model artifacts changed.

## 6. File map for reviewing the code

Paths below are relative to the repository root.

| Files | Responsibility |
| --- | --- |
| `web/lib/financial/types.ts`, `engine.ts`, `chart-values.ts` | Shared source/metric/rule contracts, decimal arithmetic, availability and chart-boundary conversion. |
| `web/lib/financial/data.ts`, `forecast-reference.ts` | Stored financial results, department/scenario completeness, source failures, causal forecast selection/provenance. |
| `web/lib/financial/presentation.ts`, `alerts.ts` | The same comparisons adapted into KPI cards and financial notification candidates. |
| `web/lib/financial/validation.ts`, `settings-data.ts` | Validated, scoped, transactional settings/budget/manual reads and writes. |
| `web/app/api/financial-settings/route.ts` | Authenticated API boundary and safe responses. |
| `web/app/components/financial/comparison-boundary.tsx`, `comparison-context.tsx`, `financial-pnl.tsx` | Server loading, shared client state/URL selector, comparison notes and canonical P&L. |
| `web/app/dashboard/page.tsx`, `components/dashboard-panels.tsx`, `components/dashboard-filters.tsx` | Wire the shared scope/source into the dashboard; preserve URL choices on scope changes. |
| `web/app/dashboard/data/dashboard-scope.ts`, `filter-options.ts`, `kpi-presentation.ts` | Default-actual versus planned months, typed comparison metadata, precise two-decimal display. |
| `web/app/dashboard/components/kpi-cards.tsx`, `profit-loss-table.tsx` | Remove inline rules/duplicate card; use common KPI and P&L comparisons. |
| `web/app/dashboard/components/profit-margin-chart.tsx`, `revenue-expense-chart.tsx` | Reuse charts with actual and matching reference series; retain local Net/Gross/anomaly behavior. |
| `web/app/home/page.tsx`, `home-overview.tsx`, `use-home-alerts.ts`, `notification-panel.tsx` | Saved notification source, shared rules, relative-percent labels, mixed alerts/history and review links. |
| `web/app/settings/page.tsx`, `settings-panel.tsx`, `financial-settings.tsx` | New navigable company planning/rule sections, feedback, retry and direct-link focus. |
| `web/prisma/financial-comparison.sql`, `finsight_schema.sql`, `schema.prisma` | Additive upgrade, fresh-install definitions and introspected client schema. |
| `web/scripts/db-apply.mjs`, `verify-financial-db.mjs`, `web/package.json` | Targeted SQL application, repeatable rollback verification and its command. |
| `web/lib/financial/*.test.ts`, `web/app/api/financial-settings/route.test.ts`, `web/tests/fixtures/financial.ts` | New shared-calculation, persistence, availability, forecast, filter and API coverage. |
| `web/app/dashboard/test/kpi-cards.test.ts`, `web/app/home/page.test.ts`, `web/tests/browser/anomalies.spec.ts` | Updated production-consumer tests and expanded browser regression checks. |
| `README.md`, this report | Usage, upgrade instructions, before/after explanation and actual test results. |

Legacy financial helpers remain for their existing callers/tests; the Dashboard
and Home production paths now use the new shared layer. To review tracked code
against the starting commit, use `git diff fe8ad16`; new files are also visible
in `git status --short` and the file map above.

## 7. Practical limits

- Auto and initial manual comparisons cover operating revenue and final profit.
  Unsupported rows remain “—”; they do not quietly use a different source.
- Invoice/category/YoY charts retain their stated actual-only or YoY behavior;
  aggregate ledger forecasts cannot correctly populate those breakdowns.
- Branch attribution remains unavailable for ledger plans/forecasts. The UI says
  to select All Branches. Missing departments are not silently excluded.
- Genuine historical forecasts require a complete compatible run issued before
  the target month starts. Otherwise only a causal labelled backtest is eligible.
  Accuracy/outcome-range information remains on the existing Forecast page.
- YTD is the sum of recorded actual ledger amounts from January through the
  selected month. It does not claim an audit of source-ledger completeness.
- The browser suite uses production components with controlled API/auth/router
  fixtures. It is not a real-user Supabase login E2E. Actual database persistence
  and unauthenticated production HTTP behavior were verified separately.
- Existing lint warnings concern unused variables in untouched sidebar,
  forecast-view and data-retrieval code. Python emitted third-party deprecation /
  CPU-count fallback warnings, and the browser runner emitted color-env warnings;
  none caused a failed test.
