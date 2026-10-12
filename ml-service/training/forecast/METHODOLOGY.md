# FinSight forecasting — methodology

How the revenue / cost / profit forecaster is built and tested: what is
forecast, which data and seeds are used for what, which models are compared,
how the production model is chosen, and how accuracy is measured. Every number
comes from the code named next to it, so each claim can be checked.

| | |
|---|---|
| User stories | US3.1 baseline (inferred), US3.2 Holt-Winters, US3.3 Prophet, US3.5 ≤15% MAPE target, US3.6 forecast view, US3.7 assistant |
| Data generator | `ml-service/datagen/` (dataset **v1.1**) |
| Forecasting code | `ml-service/app/forecast/` (shipped with the serving image) |
| Benchmark and selection | `ml-service/training/forecast/` (offline only) |
| Artifacts and report | `ml-service/models/forecast/v1/`: `config.json` (the choice), `REPORT.md`, `metrics.json`, `comparison.csv` |

---

## 0. Results at a glance (model v1, chosen 2026-10-12)

**Selected model:** Prophet with additive yearly seasonality and a stiff trend
(`changepoint_prior_scale = 0.01`). It forecasts revenue and cost for every
department, and profit is derived from them.

Company level, 1-month-ahead, rolling origin. Test window 2025-09 → 2026-08,
held-out test seeds 41–50 (120 forecasts per target):

| Target | MAPE | WAPE | ≤ 15%? | Showcase dataset (Supabase) |
|---|--:|--:|:-:|--:|
| Revenue | 3.7% | 3.8% | yes | 4.7% |
| Cost | 3.0% | 3.1% | yes | 3.6% |
| Profit | 15.5% | 13.3% | **no, by 0.5 points** | 12.9% |

- **US3.2:** Holt-Winters improves on the seasonal-naive baseline by about 45% in
  MAE for revenue and cost, and 39% for profit.
- **US3.3:** Prophet matches Holt-Winters one month ahead. It is clearly better at
  longer horizons: revenue MAPE at 6 months is 4.6% vs 7.0%, and at 12 months
  6.7% vs 10.6%. That is the "longer-term trends" question.
- **US3.5:** revenue and cost pass easily. Profit misses on the pooled test
  seeds and passes on the showcase dataset; the per-seed range is 10.3%–26.2%.
  Most of the profit error is December (§9), the 13th-month-payroll month,
  whose profit is a fifth of a normal month's. The limitation is disclosed as
  US3.5 requires: per selection in the UI (§10) and in this report.

These are results on synthetic data whose normal behaviour is smoother than a
real ledger. Read them as an upper bound (§11). Full tables:
`models/forecast/v1/REPORT.md`.

---

## 1. What is forecast

Monthly series per department (`dept_no`), built from `pbalance` joined to
`gl_mast.acc_type` (`app/forecast/series.py`). The definitions are the ones the
dashboard and the assistant already use, so a forecast can be compared with the
figures next to it:

| Metric | Definition | Matches |
|---|---|---|
| revenue | RE, credit − debit | dashboard KPI "Revenue" |
| cost | CS + EX, debit − credit | assistant metric `total_cost` |
| profit | revenue − cost + other income (OI) | dashboard KPI "Net profit", assistant `net_profit` |

**Profit is derived, never forecast on its own.** Revenue, cost and other
income are forecast; profit = revenue − cost + other income. The three numbers
therefore always reconcile (a test checks this). Other income uses a trailing
12-month mean: it is zero in the synthetic ledger, and small in a real one.

**Everything is stored per department; any selection is a sum.** "All units",
a segment, or any multi-unit filter is the sum of its departments' forecasts.
This is exactly how the dashboard sums actuals (`dept_no IN (...)`), so every
filter combination adds up and the forecast view and the assistant read the
same numbers. The cost was checked: forecasting the company total directly
gives the same accuracy to two decimals (REPORT §7), because an additive model
is close to linear in its input.

Departments with no P&L activity (the `NA` sentinel) are dropped. Business
units carry gross profit only, since all overhead is posted to `CP`.

## 2. The data

The synthetic AutoCount ledger (`datagen`, dataset v1.1): 68 months
(2021-01 → 2026-08), 7 business units plus Corporate. It has a trend per
unit (Trading declining), Singapore seasonality (Chinese New Year dip, mid-year
peak, December slowdown), a December payroll bonus, about 6% monthly revenue
noise, and injected anomalies. See `datagen/DATA_MODEL.md`.

## 3. Seeds, and why canonical mode

Seed roles are shared with the anomaly model (`training/anomaly/bench.py`), so
both models are judged on the same held-out companies:

| Role | Seeds | Used for |
|---|---|---|
| Validation | 31–40 | choosing each family's settings and the production model |
| Test | 41–50 | the reported results; used once, by `evaluate.py` |
| Showcase | `20260901` | the dataset loaded in Supabase |

**Train seeds 1–30 are not used.** Every method here is a *local* model,
fitted on one company's own history each time it forecasts. Nothing is
learned across companies, so there is nothing to train on other seeds. What the
extra seeds buy is **evaluation volume**: 10 companies give 120
one-month-ahead forecasts per target in a 12-month window instead of 12.

**Canonical, not random, anomaly mode.** The anomaly benchmark uses random
mode, which packs about 32 anomalies into 56 months (one every ~2 months) so a
detector has many positives to learn from. That is not the ledger this model
forecasts. The live dataset is canonical: 10 anomalies in 68 months. Forecast
error on random-mode ledgers mostly measures how unpredictable the injected
shocks are (profit MAPE ≈ 50% for every method). So:

- selection and test use **canonical mode** for every seed: the live dataset's
  anomaly regime, with different noise per seed;
- random mode is reported as a **stress test** (REPORT §8).

This choice was made by looking at baseline and Holt-Winters errors under both
modes on the validation seeds, before any test-window evaluation.

## 4. Time split and rolling origin

Inside every company history (`training/forecast/bench.py`):

| Months | Role |
|---|---|
| 2021-01 → 2024-08 | history only (44 months) |
| 2024-09 → 2025-08 | **validation window** |
| 2025-09 → 2026-08 | **test window** |

**Rolling origin.** For each month *t* in a window, every model is fitted on
the months **before** *t* only, and forecasts *t*, *t*+1, …, *t*+11. The
1-month-ahead errors are the US3.5 measure. This is exactly what the monthly
production run does: fit on everything closed, forecast the next month.
Forecasts whose target falls after the window are not scored, so a validation
run never scores a test month.

**Fixed origin** (REPORT §4) answers the strict reading of the acceptance
criterion "trained on the training split only, with the validation set
untouched". Each model is fitted once at the end of the validation year and
forecasts the whole test year without seeing any test month.

**Causality is tested:** `tests/test_forecast_causal.py` multiplies every value
after an origin by 5 and checks that the forecast from that origin is
unchanged. It also checks that each window scores only its own months.

## 5. The candidates (`training/forecast/candidates.py`)

| Family | Story | Candidates |
|---|---|---|
| Baseline | US3.1 | `naive` (last month), `snaive` (same month last year), `snaive_growth` (same month last year × trailing year-on-year growth) |
| Holt-Winters | US3.2 | `statsmodels` ExponentialSmoothing, period 12, parameters by maximum likelihood; trend ∈ {none, additive, additive damped} × seasonality ∈ {additive, multiplicative}: 6 settings |
| Prophet | US3.3 | yearly seasonality only (monthly data); seasonality ∈ {additive, multiplicative} × changepoint prior ∈ {0.01, 0.1, 0.5}: 6 settings |

Rules shared by all (`app/forecast/methods.py`, `engine.py`):

- Each candidate forecasts revenue **and** cost with the same method and
  settings, so profit comes from one consistent model.
- Short histories fall back to a simpler method instead of failing:
  Holt-Winters and Prophet need 24 months, seasonal methods 12. The method that
  actually ran is stored with every value.
- Multiplicative Holt-Winters falls back to additive on a series with values ≤ 0.
- Negative revenue or cost forecasts are clipped to 0.

## 6. How the production model is chosen

**Rule:** among all 15 candidates, take the one with the lowest *worst*
company-level 1-month-ahead validation MAPE across revenue, cost and profit,
pooled over seeds 31–40. Ties go to the simpler family. (`train.py::select`)

**Why "worst of three".** US3.5 requires all three targets under 15%. Revenue
and cost are always far below it (3–9%), so the binding target is profit, and
profit is derived from the other two. Picking revenue and cost separately would
ignore profit. In the smoke run, the best revenue model and the best cost model
together gave a worse profit than a model that was slightly worse on each,
because that model's revenue and cost errors moved together and cancelled.

**Validation result** (REPORT §9): Prophet (additive, 0.01) has a worst-of-three
MAPE of 20.1% (profit); the next best are Prophet multiplicative at 22.6%,
seasonal naive at 22.9% and Holt-Winters (no trend, additive) at 23.0%. The
validation window is harder than the test window: it contains three canonical
shocks (A02's recovery in 2024-09, A07 in 2024-12, A05 in 2025-03).

**The test set is used once.** On the test window, Holt-Winters
(no trend, additive) scored 14.3% on profit against the selected Prophet's
15.5%, so it would have passed. Switching to it now would choose the model on
the test set and make the test numbers meaningless. The gap is also within
seed-to-seed noise (profit MAPE ranges 10–26% across test seeds). The
selection stands.

## 7. Metrics (`app/forecast/metrics.py`)

| Metric | Definition | Why |
|---|---|---|
| **MAPE** | mean of \|actual − forecast\| / \|actual\| × 100, over months with a non-zero actual | the US3.5 target |
| **WAPE** | Σ\|actual − forecast\| / Σ\|actual\| × 100 | not inflated by a few months with near-zero actuals, which matters for profit |
| MAE, RMSE | S$ | required by US3.2 / US3.3; RMSE penalises large misses |
| Skill | 1 − MAE / MAE(seasonal naive) | "does trend/seasonality modelling improve on the baseline?" (US3.2) |

Errors are pooled over all forecasts in a window across the seeds (company
level = departments summed first). "Meets the target" is MAPE ≤ 15% with a
1e-9 tolerance, the same rule in Python and in the web layer.

**The band** shown around a forecast is empirical. At horizon *h* it is the
10th–90th percentile of the relative errors (actual − forecast) / \|forecast\|
of past forecasts at the same horizon, applied to the new forecast: "80% of
past forecasts at this horizon landed in this range". It needs no distributional
assumption and works for any summed selection, because it is computed from the
same summed backtest rows.

## 8. Reading `REPORT.md`

| § | Shows | Answers |
|---|---|---|
| 1 | 1-month-ahead MAPE / WAPE / MAE / RMSE per target, seed range, showcase | US3.5 pass/fail |
| 2 | every baseline, the tuned Holt-Winters and Prophet, and the skill vs seasonal naive | US3.2, US3.3 |
| 3 | MAPE at h = 1, 3, 6, 12 | US3.3 "longer-term trends" |
| 4 | fit once at the end of validation, forecast the test year | strict "validation untouched" |
| 5 | per business unit | where the error is |
| 6 | profit error by calendar month | why profit misses |
| 7 | bottom-up vs direct company model | what summing departments costs |
| 8 | random-mode stress test | behaviour on a much noisier ledger |
| 9 | every candidate on validation | how the model was chosen |

`comparison.csv` holds every number behind §2–§9 in one long format (family,
candidate, split, data, seeds, level, series, metric, horizon, n, MAPE, WAPE,
MAE, RMSE). A new model is compared by appending its rows (US3.2/US3.3 AC3).
The column meanings are in `training/forecast/compare.py`.

## 9. Why profit is the hard target

Profit is about 13% of revenue, the difference of two large numbers. A revenue
surprise flows through to profit at roughly the gross margin, and cost noise
adds to it. In S$, the profit error is small: MAE S$87k a month, against
revenue MAE S$201k. As a percentage, it is large whenever profit itself is
small. December carries the 13th-month payroll, so its average profit is
S$183k against S$400–850k in other months. Its mean APE is 54%, against
6–18% for every other month (REPORT §6). Without December, profit MAPE on the
test seeds would be about 12%. WAPE (13.3%), which weights months by size, is
under the target.

This is why the UI shows WAPE and the band next to MAPE, and why a unit with
near-zero profit (Trading, whose margin erodes to about 1% under A10) should be
read through its WAPE.

## 10. Production

`app/forecast/run.py` (`python -m app.forecast.run` monthly via cron, or
`POST /forecast/run`):

1. Read monthly P&L per department from `pbalance` (one aggregate query).
2. Keep closed months only. A month still in progress is never used.
3. Fit the selected model on every department × metric and forecast 12 months
   ahead.
4. Replay the last 24 months as a rolling backtest on the live ledger. This is
   the source of the band and of the live accuracy.
5. Write both to `forecast_value` under a new `forecast_run`, whose `summary`
   holds the company-level live accuracy over the last 12 months and whether
   each target meets 15%. Every run is kept.

A run fits about 375 Prophet models. They are fitted in parallel threads
(`FORECAST_JOBS`, default 8), giving identical results; it takes about 13 s
locally. A session advisory lock stops two runs overlapping.

On the Supabase (showcase) ledger, the live accuracy of the first run is
revenue 4.7%, cost 3.6%, profit 12.9%: all three within the target.

The web layer (`web/app/dashboard/data/forecast.ts`) recomputes accuracy and
the band for whatever units are selected, from the stored backtest rows. That
is how US3.5's disclosure works per selection: a selection whose profit
forecasts miss 15% is flagged as such.

## 11. Limitations

- **Synthetic data.** Normal months are smoother than a real ledger: one
  payment per account per month and 6% noise. Real errors will be higher.
  Re-run the benchmark on real AutoCount history before quoting accuracy to
  the sponsor as final.
- **No drivers.** The models see only each series' own past. Known future
  events (a won contract, a price change) are not used.
- **Anomalies are not removed from history.** A test that replaced robust
  outliers (STL, |z| > 3.5) before fitting made validation accuracy slightly
  worse, so it was dropped.
- **The band is empirical:** with 24 backtest origins, the 12-month band rests
  on 13 past forecasts.
- **Branch filter:** the ledger has no branch attribution, so forecasts cannot
  be filtered by branch, the same limitation as every ledger panel.

## 12. Reproduce

```bash
cd ml-service && source venv/bin/activate
python -m training.forecast.train       # ~9 min: 15 candidates x 10 validation seeds -> config.json
python -m training.forecast.evaluate    # ~3 min: test seeds + showcase + stress -> REPORT.md, metrics.json
python -m app.forecast.run              # live run against DATABASE_URL
```

Add `--quick` to `train` and `evaluate` for a smoke run on 2 seeds. Nothing in
`training/` touches the database: every seed is generated in memory with
`datagen.pipeline.generate`, and the run is deterministic.
