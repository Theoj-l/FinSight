# FinSight forecasting — methodology

How the revenue / cost / profit forecaster is built and tested: what is
forecast, which data and seeds are used for what, which models are compared,
how anomalous months are handled, how the production model is chosen, and how
accuracy is measured. Every number comes from the code named next to it, so
each claim can be checked.

| | |
|---|---|
| User stories | US3.1 baseline (inferred), US3.2 Holt-Winters, US3.3 Prophet, US3.5 ≤15% MAPE target, US3.6 forecast view, US3.7 assistant |
| Data generator | `ml-service/datagen/` (dataset **v1.1**) |
| Forecasting code | `ml-service/app/forecast/` (shipped with the serving image) |
| Benchmark and selection | `ml-service/training/forecast/` (offline only) |
| Artifacts and report | `ml-service/models/forecast/v2/`: `config.json` (the choice), `REPORT.md`, `metrics.json`, `comparison.csv`. `models/forecast/v1/` is the previous model, kept for comparison and as a rollback. |

---

## 0. Results at a glance (model v2, chosen 2026-10-28)

**Selected model:** Holt-Winters with additive seasonality and no trend,
fitted with the months the anomaly model flagged left out (§6). It forecasts
revenue and cost for every department, and profit is derived from them.

Company level, 1-month-ahead, rolling origin. Test window 2025-09 → 2026-08,
**fresh** held-out test seeds 51–60 (120 forecasts per target):

| Target | MAPE | WAPE | ≤ 15%? | Showcase dataset (Supabase) |
|---|--:|--:|:-:|--:|
| Revenue | 3.6% | 3.7% | yes | 3.5% |
| Cost | 3.0% | 3.1% | yes | 2.8% |
| Profit | 12.0% | 10.6% | **yes** | 12.0% |

- **US3.5:** all three targets meet the 15% threshold. Profit MAPE ranges from
  9.6% to 17.0% across the ten test companies.
- **US3.2:** Holt-Winters improves on the seasonal-naive baseline by 49% in MAE
  for revenue, 50% for cost and 35% for profit.
- **US3.3:** Prophet (also masked) ties Holt-Winters one month ahead (profit
  11.9% vs 12.0%) and is clearly better further out. Revenue MAPE at 6 months is
  4.1% vs 6.9%, and at 12 months 5.3% vs 9.7%; profit at 6 months is 10.8% vs
  15.0%. That is the "longer-term trends" question; see §12 for what it means
  for the 12-month view.

**What changed from v1** (REPORT §0): v1 used Prophet without masking and
missed the profit target on its test companies.

| 1-month-ahead MAPE | Revenue | Cost | Profit |
|---|--:|--:|--:|
| v1, test seeds 41–50 (as published) | 3.7% | 3.0% | 15.5% |
| v2, the same seeds 41–50 | 3.1% | 2.6% | 12.0% |
| v1 model, fresh seeds 51–60 | 4.1% | 3.3% | 14.6% |
| **v2, fresh seeds 51–60 (reported)** | **3.6%** | **3.0%** | **12.0%** |

On both sets of companies v2 cuts profit error by 2.6–3.5 points.

These are results on synthetic data whose normal behaviour is smoother than a
real ledger. Read them as an upper bound (§12). Full tables:
`models/forecast/v2/REPORT.md`.

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
same numbers. Forecasting the company total directly is *less* accurate in v2
(profit 17.0% vs 12.0%, REPORT §7). Masking works per unit, so a company-level
model has to drop a whole month whenever any unit is flagged.

Departments with no P&L activity (the `NA` sentinel) are dropped. Business
units carry gross profit only, since all overhead is posted to `CP`.

## 2. The data

The synthetic AutoCount ledger (`datagen`, dataset v1.1): 68 months
(2021-01 → 2026-08), 7 business units plus Corporate. It has a trend per
unit (Trading declining), Singapore seasonality (Chinese New Year dip, mid-year
peak, December slowdown), a December payroll bonus, about 6% monthly revenue
noise, and injected anomalies. See `datagen/DATA_MODEL.md`.

## 3. Seeds, and why canonical mode

| Role | Seeds | Used for |
|---|---|---|
| Validation | 31–40 | choosing each family's settings and the production model (shared with the anomaly model) |
| Test | **51–60** | the reported v2 results; used once, by `evaluate.py` |
| v1's test seeds | 41–50 | v1's reported results; for v2, a like-for-like comparison only |
| Showcase | `20260901` | the dataset loaded in Supabase |

**Fresh test companies for v2.** v1's test results (seeds 41–50) were known
before v2 was designed, and the v2 change was motivated by them. Reporting v2
on the same companies would no longer be a clean held-out test. Because the data
is simulated, a new set of companies can be drawn that no model, setting or
decision has touched, so v2's headline numbers come from seeds 51–60. v2 is also
run on 41–50, for comparison with v1 only.

**Train seeds 1–30 are not used.** Every method here is a *local* model,
fitted on one company's own history each time it forecasts. Nothing is learned
across companies, so there is nothing to train on other seeds. What the extra
seeds buy is **evaluation volume**: 10 companies give 120 one-month-ahead
forecasts per target in a 12-month window instead of 12. (The anomaly model
used for masking was trained on random-mode seeds 1–30; it has never seen the
canonical companies used here.)

**Canonical, not random, anomaly mode.** The anomaly benchmark uses random
mode, which packs about 32 anomalies into 56 months so a detector has many
positives to learn from. That is not the ledger this model forecasts. The live
dataset is canonical: 10 anomalies in 68 months. So selection and test use
**canonical mode** for every seed (the live dataset's anomaly regime, with
different noise per seed), and random mode is reported as a **stress test**
(REPORT §8). This choice was made on the validation seeds before any test
evaluation.

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

**Causality is tested.**
- `tests/test_forecast_causal.py` multiplies every value after an origin by 5
  and checks that the forecast from that origin is unchanged. It also checks
  that each window scores only its own months.
- `tests/test_forecast_mask.py` checks that the values in masked months have
  no influence on a forecast, for every method.

## 5. The candidates (`training/forecast/candidates.py`)

| Family | Story | Candidates |
|---|---|---|
| Baseline | US3.1 | `naive` (last month), `snaive` (same month last year), `snaive_growth` (same month last year × trailing year-on-year growth) |
| Holt-Winters | US3.2 | `statsmodels` ExponentialSmoothing, period 12, parameters by maximum likelihood; trend ∈ {none, additive, additive damped} × seasonality ∈ {additive, multiplicative}: 6 settings |
| Prophet | US3.3 | yearly seasonality only (monthly data); seasonality ∈ {additive, multiplicative} × changepoint prior ∈ {0.01, 0.1, 0.5}: 6 settings |

Rules shared by all (`app/forecast/methods.py`, `engine.py`):

- In v2 every candidate is fitted with anomalous months masked (§6).
- Each candidate forecasts revenue **and** cost with the same method and
  settings, so profit comes from one consistent model.
- Short histories fall back to a simpler method instead of failing:
  Holt-Winters and Prophet need 24 months, seasonal methods 12. The method that
  actually ran is stored with every value.
- Multiplicative Holt-Winters falls back to additive on a series with values ≤ 0.
- Negative revenue or cost forecasts are clipped to 0.

## 6. Anomaly masking (new in v2)

### 6.1 Why

v1 missed the profit target (15.5%). Two analyses on the **validation**
companies, before any test result for v2 existed, showed where the error came
from.

**The noise floor.** Each month the generator adds random shocks: about 6% to
each unit's revenue, 5% to each expense account, plus per-invoice margin
variation. A perfect forecaster would know every month's noise-free expected
value and miss only those shocks. Regenerating each company with the monthly
shocks set to zero gives that expected path. The random draws are still
consumed, so everything else stays identical.

| Perfect-forecaster error (profit MAPE) | Validation 31–40 | Test 41–50 | Test 51–60 |
|---|--:|--:|--:|
| all months | 9.4% | 9.8% | 8.6% |
| December only | 20.0% | 30.0% | 23.2% |

So the target is reachable in principle, and v1 was 6–11 points above the floor.

**Where the gap was.** Comparing v1's forecasts with the expected path, unit by
unit, showed the excess error concentrated around the canonical anomalies:

- **Engineering:** profit under-forecast by about S$54k every month, a
  consistent bias. A02, a key client lost from 2024-03 to 2024-08, taught the
  model a lower normal level, so after the client returned it under-predicted.
- **Dec 2024:** S$264k off, mostly the S$185k revenue posted without an invoice
  (A07). **Mar 2025:** S$135k off, the S$208k one-off repair (A05).

The one-off shocks inside the window cannot be forecast. But every anomaly also
**stays in the history**, where it distorts every forecast fitted after it.
That part is fixable.

### 6.2 The rule (`app/forecast/anomaly_mask.py`)

Leave out of every fit the cells that the anomaly model (`models/anomaly/v1`)
flagged:

| Anomaly alert | Masked cells |
|---|---|
| `dept`: a business unit in a month | that unit's revenue **and** cost that month |
| `acc`: a Corporate expense account in a month | Corporate (`CP`) cost that month |
| `cust`: a customer's receivables | nothing (no effect on revenue or cost) |

- **How each method uses the mask** (`methods.py`). Prophet fits on the
  remaining months directly, since it handles gaps. Holt-Winters and the
  baselines need an unbroken series, so a masked month is replaced by the mean
  of the same calendar month one year either side; if neither is available, the
  mean of the neighbouring months.
- **Safeguard.** If masking would leave fewer than 24 months, the series is fitted unmasked.
- **No leakage.** The anomaly model's alert for month *t* uses only data up to
  the end of *t* (`tests/test_anomaly_features_causal.py`). A forecast made at
  origin *T* only ever sees cells up to *T*, so masking never lets later data in.
- **In the benchmark**, each simulated company is scored by the anomaly model
  (about 68 masked cells per company). **In production**, the run reads the
  same alerts from the `anomaly_alert` table (§11).

### 6.3 Evidence before adopting it

These comparisons were run on the validation companies only, using v1's
production settings (Prophet, additive, 0.01):

| Validation, 1-month-ahead | Revenue | Cost | Profit MAPE | Profit WAPE |
|---|--:|--:|--:|--:|
| No masking (v1) | 3.9% | 3.4% | 20.1% | 16.8% |
| Mask the **true** anomaly cells (from the labels; a ceiling) | 3.7% | 3.0% | 18.1% | 14.6% |
| **Mask the anomaly model's alerts** (what v2 does) | 3.7% | 3.0% | 18.1% | 14.6% |

The anomaly model's alerts are as good as the true labels. An ensemble was also
tried (averaging Prophet with Holt-Winters and/or the growth baseline). It
gave no profit gain (19.9%–20.6%), so it was not adopted.

The label ceiling deliberately leaves out A10 (Trading's gradual margin erosion)
and A09 (a customer who stopped paying). A10 is a lasting change the forecast
should follow, and A09 does not touch revenue or cost.

## 7. How the production model is chosen

**Rule:** among all 15 candidates (each fitted with masking), take the one with
the lowest *worst* company-level 1-month-ahead validation MAPE across revenue,
cost and profit, pooled over seeds 31–40. Ties go to the simpler family.
(`train.py::select`)

**Why "worst of three".** US3.5 requires all three targets under 15%. Revenue
and cost are always far below it, so the binding target is profit, and profit
is derived from the other two. Picking revenue and cost separately would ignore
profit: a model whose revenue and cost errors move together can give a better
profit than the separately best revenue and cost models.

**Validation result** (REPORT §9):

| Validation, 1-month-ahead MAPE | Revenue | Cost | Profit | v1 profit (no masking) |
|---|--:|--:|--:|--:|
| **Holt-Winters, no trend, additive (selected)** | 3.3% | 2.9% | 15.2% | 23.0% |
| Prophet, additive, 0.01 (v1's choice) | 3.7% | 3.0% | 18.1% | 20.1% |
| Seasonal naive | 7.2% | 6.9% | 18.7% | 22.9% |
| Seasonal naive × growth | 3.4% | 2.9% | 18.9% | 23.7% |

Masking helps every family except the naive "last month" rule (23.3% → 26.3%):
when the latest month is masked, naive falls back to the same month last year.
Holt-Winters gains the most. A likely reason is that it weights recent months
most heavily, so in v1 a recent anomaly (A02, just before the validation
window) dragged it down furthest. With the anomalous months replaced, all six
Holt-Winters settings rank above every Prophet setting.

**The test set is used once.** On the test window, Prophet scored 11.9% on
profit against Holt-Winters' 12.0%: a tie well within seed-to-seed noise. The
selection was made on validation and stands. The same rule kept v1 on Prophet
when Holt-Winters scored slightly better on v1's test.

## 8. Metrics (`app/forecast/metrics.py`)

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

## 9. Reading `REPORT.md`

| § | Shows | Answers |
|---|---|---|
| 0 | v1 vs v2 on v1's test companies and on the fresh ones | what masking changed |
| 1 | 1-month-ahead MAPE / WAPE / MAE / RMSE per target, seed range, showcase | US3.5 pass/fail |
| 2 | every baseline, the tuned Holt-Winters and Prophet, the v1 model, and the skill vs seasonal naive | US3.2, US3.3 |
| 3 | MAPE at h = 1, 3, 6, 12 | US3.3 "longer-term trends" |
| 4 | fit once at the end of validation, forecast the test year | strict "validation untouched" |
| 5 | per business unit | where the error is |
| 6 | profit error by calendar month | why profit is the hard target |
| 7 | bottom-up vs direct company model | what summing departments costs |
| 8 | random-mode stress test | behaviour on a much noisier ledger |
| 9 | every candidate on validation | how the model was chosen |

`comparison.csv` holds every number behind §0–§9 in one long format (family,
candidate, split, data, seeds, level, series, metric, horizon, n, MAPE, WAPE,
MAE, RMSE). A new model is compared by appending its rows (US3.2/US3.3 AC3).
The column meanings are in `training/forecast/compare.py`.

## 10. Why profit is the hard target

Profit is about 13% of revenue, the difference of two large numbers. A revenue
surprise flows through to profit at roughly the gross margin, and cost noise
adds to it. In S$, the profit error is small: MAE S$69k a month in v2, against
revenue MAE S$196k. As a percentage, it is large whenever profit itself is
small.

December carries the 13th-month payroll, so its average profit is S$182k
against S$400–860k in other months. v2's December mean APE is 31.7%, against
6–14% for every other month (REPORT §6). Even a perfect forecaster scores 23% in
December on these companies (§6.1).

This is why the report shows WAPE (10.6%) next to MAPE, and why a unit with
near-zero profit should be read through its WAPE. Trading, whose margin erodes
to about 1% under A10, has a profit MAPE of 988% but a WAPE of 47%.

## 11. Production

`app/forecast/run.py` (`python -m app.forecast.run` monthly via cron, or
`POST /forecast/run`):

1. Read monthly P&L per department from `pbalance` (one aggregate query), and
   the anomaly alerts from `anomaly_alert` (v2).
2. Keep closed months only. A month still in progress is never used.
3. Fit the selected model on every department × metric, with the flagged
   months masked, and forecast 12 months ahead.
4. Replay the last 24 months as a rolling backtest on the live ledger. This is
   the source of the band and of the live accuracy.
5. Write both to `forecast_value` under a new `forecast_run`. Its `summary`
   holds the company-level live accuracy over the last 12 months, whether each
   target meets 15%, and which cells were masked. Every run is kept.

**Ordering.** Anomaly scoring runs nightly at 02:00 SGT, and the forecast at
03:00 SGT on the 2nd of each month, so the just-closed month has been scored
first. `datagen --load` also rescores anomalies before it refreshes forecasts.
If anomaly scoring has never run, the forecast still runs, masks nothing, and
says so (`summary.anomaly_mask.cells = 0`).

A run fits a few hundred small Holt-Winters models in about 11 s; a session
advisory lock stops two runs overlapping. On the Supabase (showcase) ledger the
first v2 run (run 3) masked 65 cells. Its live accuracy is revenue 3.5%, cost
2.8%, profit 12.0%: all within the target.

The web layer (`web/app/dashboard/data/forecast.ts`) recomputes accuracy and
the band for whatever units are selected, from the stored backtest rows. That
is how US3.5's disclosure works per selection: a selection whose profit
forecasts miss 15% is flagged as such.

## 12. Limitations

- **Synthetic data.** Normal months are smoother than a real ledger: one
  payment per account per month and 6% noise. Real errors will be higher.
  Re-run the benchmark on real AutoCount history before quoting accuracy to
  the sponsor as final.
- **Masking is only as good as the anomaly model.** A false alarm removes a
  normal month from the fit; a missed anomaly stays in the history. The anomaly
  model also flags Trading's gradual margin erosion (A10), a lasting change.
  Where masking would leave fewer than 24 months, nothing is masked.
- **The 12-month view.** Holt-Winters was chosen on next-month accuracy, the
  target. Further out it is weaker than Prophet: revenue MAPE at 12 months is
  9.7% vs 5.3%, and profit at 6 months 15.0% vs 10.8%. A future version could
  choose the model per horizon on the validation window.
- **No drivers.** The models see only each series' own past. Known future
  events (a won contract, a price change) are not used.
- **The band is empirical.** With 24 backtest origins, the 12-month band rests
  on 13 past forecasts.
- **Branch filter.** The ledger has no branch attribution, so forecasts cannot
  be filtered by branch, the same limitation as every ledger panel.

## 13. Reproduce

```bash
cd ml-service && source venv/bin/activate
python -m training.forecast.train       # ~10 min: 15 candidates x 10 validation seeds, masked -> config.json
python -m training.forecast.evaluate    # ~5 min: fresh test seeds + v1's seeds + showcase + stress -> REPORT.md, metrics.json
python -m app.forecast.run              # live run against DATABASE_URL (run anomaly scoring first)
python -m training.forecast.train --no-mask --out /tmp/nomask   # the same selection without masking
```

Add `--quick` to `train` and `evaluate` for a smoke run on 2 seeds. Nothing in
`training/` touches the database: every seed is generated in memory with
`datagen.pipeline.generate`, and every run is deterministic.

## 14. Version history

| Version | Date | Model | Masking | Test result (1-month-ahead MAPE: revenue / cost / profit) |
|---|---|---|---|---|
| v1 | 2026-10-12 | Prophet, additive, changepoint prior 0.01 | no | seeds 41–50: 3.7% / 3.0% / **15.5%**. Profit missed the target. |
| **v2** | 2026-10-28 | Holt-Winters, no trend, additive | anomaly model alerts | fresh seeds 51–60: 3.6% / 3.0% / **12.0%**. All targets met. |

v1's write-up is in git history (`training/forecast/METHODOLOGY.md` at commit
`638faae`), and its artifacts remain in `models/forecast/v1/`.
