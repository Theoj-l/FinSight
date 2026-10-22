# Business-unit forecasting and dashboard repair report

Implemented 19 October 2026. This report covers the follow-up to the unified financial comparison implementation, rather than attributing all existing uncommitted changes to this update.

## What changed, in plain language

You enter a budget or manual forecast for an individual business unit once. Selecting **Machining**, **Bulk**, or **All business units** calculates the combined figures from those unit values. There is no separate group target that can contradict the units underneath it.

| Area | Before this update | After this update |
|---|---|---|
| Accounting filters | Dashboard called units “Product groups”; Settings called them “Department” | Consistent Business type and Business unit controls; actual invoice product-group chart names remain intact |
| Group selection | Users manually picked unit codes | Machining/Bulk membership comes from `dept.segment`; users can select all or a subset |
| Filter history | Unit/month URLs only | `businessType` persists alongside existing `unit` parameters; refresh and Back/Forward restore the selection |
| Settings | Opened the first department’s editor | Starts with a read-only All business units summary; choose a type for group totals or a unit for editing |
| Forecast aggregation | Database summed whatever forecast rows existed | Retains unit identity and requires compatible records for every contributing unit before summing |
| Forecast accuracy/ranges | Could be calculated using incomplete aggregate inputs | Computed from aligned, complete aggregate backtests; incomplete coverage names the affected units |
| Inactive units | Placeholder codes could invalidate group coverage | Uses the model’s monthly P&L activity criterion; inactive Unallocated is excluded, Corporate remains included |
| Chart references | Thin green/amber dashed lines | 3px cyan/purple lines, 5px white backing, different dashes and circle/diamond markers; legends match and tooltips name the source |
| Prisma development cache | Reused any cached client, including one generated before financial models existed | Replaces incompatible cached clients; an outdated generated module produces actionable regeneration/restart guidance |
| Optional planning failures | A synchronous missing-delegate error bypassed `.catch()` and could remove reporting filters | Defers query invocation so synchronous and asynchronous failures are handled; actual filters remain usable |
| Financial load failures | An early synchronous error could leave another rejected promise unhandled | Attaches handlers before executing the parallel financial queries |
| Error display | Could show `Applied: 0-` alongside “Data refreshed today” | Shows Unavailable and Retry; the filter success badge is hidden on failure and makes no unverified freshness claim |
| Local connection pool | One connection, default ten-second queue timeout | Documented `connection_limit=10` and `pool_timeout=20`; development server restarted |

## Calculation and scope rules

- Machining: EN, FA, MN. Bulk: CP, CR, HL, TP, TR in the current active dataset. Membership is read from the database, not hard-coded into totals.
- A unit is active when any monthly operating-revenue, combined cost-of-sales/operating-expense, or other-income balance is nonzero. This matches the forecasting loader’s activity rule.
- Active units remain required even when their forecast is missing. Missing data never becomes an implicit zero.
- Forecast rows must match kind, metric, origin, reporting month and horizon within the selected successful run. Duplicate unit rows and missing backtest actuals are rejected for the group point.
- Monetary references are summed; budget profit and ratios continue through the shared component-based comparison engine. Group accuracy is calculated after summing predictions and actuals, rather than averaging unit percentage errors.
- Settings GET accepts optional `businessType=Machining|Bulk`, returns a read-only aggregate `summary`, and rejects incompatible type/unit requests. Existing unit-level write fields remain compatible.
- Dashboard auto/manual comparisons still support operating revenue and net profit. Unsupported margin/expense forecasts remain unavailable. Home retains its separately saved notification policy.
- Net/Gross remains a client-side change using preloaded values. It does not reload the dashboard.
- No new tables, model training, model scoring, or persistent test financial records were required by this update.

## Files to review

- `web/app/dashboard/data/dashboard-scope.ts`, `filter-options.ts`, and `components/dashboard-filters.tsx`: group metadata, URL validation and selection, Retry and unavailable presentation.
- `web/lib/financial/business-units.ts`: active-unit calculation matching the model.
- `web/app/dashboard/data/forecast-coverage.ts` and `forecast.ts`: complete aligned forecast aggregation and coverage disclosure.
- `web/lib/financial/data.ts`, `forecast-reference.ts`, `settings-data.ts`: financial load isolation, missing-unit messages and shared Settings summaries.
- `web/app/api/financial-settings/route.ts`, `web/app/settings/financial-settings.tsx`: validated group reads and unit-only editors.
- `web/app/dashboard/components/comparison-style.tsx`, `profit-margin-chart.tsx`, `revenue-expense-chart.tsx`: shared reference styles and legends.
- `web/lib/db.ts`, Dashboard/Forecast pages: cache repair and failure presentation.
- `web/.env`: local connection options only; credentials are not included in this report or tracked changes.

## Verification actually completed

| Check | Result |
|---|---|
| Vitest full web suite | **364 passed**, 43 files; 17 tests added since the prior 347-test suite |
| Styled Chromium browser suite, run after production build | **12 passed**; three new group/history and desktop/mobile styling checks |
| Real-database transactional verification | **16 passed**, including both groups, Corporate, inactive placeholders, unit-save propagation and missing coverage |
| TypeScript | Passed |
| ESLint | 0 errors; the same 8 pre-existing warnings in unrelated code |
| Production webpack build | Passed, including Prisma generation and Next route compilation |
| `git diff --check` | Passed |
| Actual signed-in Safari dashboard after restart | Loaded filters, KPI cards, charts, anomaly results and P&L; Bulk selection changed the live KPI/P&L amounts |
| Actual signed-in Safari Forecast page | Loaded company forecasts; selecting Machining updated the URL, twelve-month forecasts and outcome ranges |
| Development server error log after these live checks | 0 ERROR entries |
| Screenshot review | Reviewed desktop/mobile chart screenshots; final captures wait for the actual-bar animation and include reference lines crossing bars |

Database verification deliberately rolls back its entire transaction. Before/after row counts and content fingerprints matched across ten ledger, budget, manual-plan, model and anomaly tables. The Machining/Bulk tests saved unit estimates, checked exact group totals, removed one estimate, and verified that the group reference became unavailable and identified that unit. None of these test writes remained.

The automated browser harness uses real production components and compiled styles with controlled authentication/router/API fixtures. It is not a substitute for a full live authenticated route test; the separate Safari checks above cover actual signed-in Dashboard and Forecast loading. Browser checks also cover all comparison sources, Net/Gross without new requests, anomaly chart navigation, evidence pagination, mixed Home notifications, Settings saves/failures, and mobile overflow.

Initial browser startup failed because the macOS sandbox blocked Chromium; it passed when run with the approved execution permissions. The new visual tests initially used the old one-month fixture, which cannot produce a line; the fixture now contains six months, including overlap with the bars. The final suite passes. No ML code changed, so the Python suite was not rerun for this follow-up.

## How to use it

1. In Dashboard or Forecast, choose a Business type, optionally select units within it, then Apply Filters.
2. In Settings → Budgets & Forecasts, leave Business unit on All business units to view calculated totals. Choose a single unit to edit budget/manual amounts.
3. Save the unit’s entries, then return to the group selection to reload its totals. Missing required values are shown as unavailable with coverage information.
4. Use the dashboard’s comparison selector to choose Previous month, Budget, Auto forecast or Manual forecast. Use Net/Gross beside the profit chart to switch that graph locally.
