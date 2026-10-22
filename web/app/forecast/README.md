# Forecast

The Forecast page gives managers a forward-looking view of revenue, cost, and
net profit alongside recent actual performance.

## Route

The page is available at `/forecast`.

Forecast-specific UI belongs in this folder:

- `page.tsx` — authenticated server page and forecast data loading.
- `components/forecast-view.tsx` — interactive metric selection, summary cards,
  actual-versus-projection chart, and forecast horizon table.
- `components/forecast-loading.tsx` — layout-preserving loading skeleton.
- `test/` — Forecast-specific tests.

## Data flow

The page calls `getForecast(scope)` from
`../dashboard/data/forecast.ts`. The loader reads the latest successful
`forecast_run` and aggregates `forecast_value` rows for the selected product
groups.

The browser never calls the ML service, Prisma, or PostgreSQL directly.

Each metric series contains:

- `history` — closed-month actuals.
- `pastForecasts` — historical one-month-ahead projections next to their
  actual outcomes.
- `forecast` — future projections with an optional lower and upper typical
  outcome range.
- `accuracy` — backtest accuracy data used by the data layer and tests.

## Filters

Forecast uses the shared dashboard filter query parameters:

- `unit` — product group/accounting department codes.
- `branch` — branch codes.

The Forecast page intentionally does not expose the Dashboard period filter.
Forecasts always begin after the latest closed month in the current successful
forecast run. The page uses the latest actual history as the comparison
baseline.

Branch-level ledger attribution is not currently available. Selecting a branch
shows the shared `BRANCH_LEDGER_MESSAGE` instead of presenting unsupported
forecast data.

## Chart semantics

- Solid navy line — closed-month actuals.
- Dashed blue line — previous one-month-ahead projections.
- Dashed red line — future projections.
- Blue shaded band — typical lower-to-upper outcome range derived from
  historical forecast errors at the same horizon.

The shaded range is not a guarantee or a formal statistical confidence
interval. It indicates how wide comparable forecast errors have been in
backtesting; wider bands indicate greater uncertainty.

Forecast values must remain labelled as projections. Do not present them as
guaranteed results.

## Conventions

- Use Server Components for data access.
- Use client components only for chart interaction and local metric selection.
- Keep Forecast-specific components under `components/`.
- Keep Forecast-specific tests under `test/`.
- Use the shared `PageLoading` component for in-page filter transitions and
  preserve the Forecast-specific skeleton for initial data loading.
