# Forecast model v2 — test report

Selected model: `holt_winters(damped=False, seasonal=add, trend=None)` (family Holt-Winters), chosen on the validation window (202409, 202508) over seeds 31-40.
Test window 202509–202608, rolling origin, test seeds 51-60 (canonical mode) and the showcase dataset (seed 20260901, the data in Supabase).
Trained 2026-10-28T13:36:09 at git `6c0d363-dirty`. How to read this report: `training/forecast/METHODOLOGY.md` §9.

Months the anomaly model flagged are left out of every fit (68 unit-month cells per company on average).

## 0. What changed from v1

v2 leaves months flagged by the anomaly model out of every fit. v1's test companies had already been seen before v2 was designed, so v2 is reported on fresh companies (51-60). 1-month-ahead MAPE, company level:

| | Revenue | Cost | Profit | Profit WAPE |
|---|--:|--:|--:|--:|
| v1, test companies 41-50 (as published) | 3.7% | 3.0% | 15.5% | 13.3% |
| **v2**, test companies 41-50 (same companies as v1) | 3.1% | 2.6% | 12.0% | 9.8% |
| v1 model, fresh test companies 51-60 | 4.1% | 3.3% | 14.6% | 13.2% |
| **v2, fresh test companies 51-60 (the reported result)** | 3.6% | 3.0% | 12.0% | 10.6% |

## 1. Target check (US3.5): 1-month-ahead MAPE ≤ 15%, company level

| Target | MAPE (test seeds) | WAPE | MAE | RMSE | Seed range (MAPE) | Showcase MAPE | ≤ 15%? |
|---|--:|--:|--:|--:|--:|--:|:-:|
| revenue | 3.6% | 3.7% | S$196k | S$249k | 3.1% – 5.1% | 3.5% | yes |
| cost | 3.0% | 3.1% | S$141k | S$182k | 2.4% – 4.3% | 2.8% | yes |
| profit | 12.0% | 10.6% | S$69k | S$84k | 9.6% – 17.0% | 12.0% | yes |

All three targets meet the threshold on the test seeds.

## 2. Model comparison (US3.2, US3.3): 1-month-ahead, company level, test seeds

Skill = 1 − MAE / MAE of the seasonal naive. Positive means better than the seasonal naive.

| Model | Revenue MAPE | Cost MAPE | Profit MAPE | Profit WAPE | Revenue skill | Cost skill | Profit skill |
|---|--:|--:|--:|--:|--:|--:|--:|
| Baseline: `naive` | 5.9% | 5.4% | 37.8% | 22.5% | +19% | +14% | -39% |
| Baseline: `snaive` | 7.2% | 6.1% | 17.6% | 16.2% | +0% | +0% | +0% |
| Baseline: `snaive_growth` | 3.8% | 3.2% | 14.8% | 13.0% | +48% | +49% | +20% |
| Holt-Winters: `holt_winters(damped=False, seasonal=add, trend=None)` **(selected)** | 3.6% | 3.0% | 12.0% | 10.6% | +49% | +50% | +35% |
| Prophet: `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` | 3.5% | 2.9% | 11.9% | 10.1% | +51% | +52% | +38% |
| *Reference:* `v1 production model, no masking: prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` | 4.1% | 3.3% | 14.6% | 13.2% | +42% | +45% | +19% |

## 3. Error by horizon (US3.3: longer-term trends), MAPE, test seeds

Targets after the test window are not scored, so longer horizons have fewer forecasts.

**revenue**

| Model | h=1 | h=3 | h=6 | h=12 |
|---|--:|--:|--:|--:|
| Baseline: `naive` | 5.9% | 13.1% | 18.1% | 8.8% |
| Baseline: `snaive` | 7.2% | 7.3% | 7.5% | 8.8% |
| Baseline: `snaive_growth` | 3.8% | 3.9% | 3.8% | 3.3% |
| Holt-Winters: `holt_winters(damped=False, seasonal=add, trend=None)` **(selected)** | 3.6% | 4.7% | 6.9% | 9.7% |
| Prophet: `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` | 3.5% | 3.8% | 4.1% | 5.3% |
| *Reference:* `v1 production model, no masking: prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` | 4.1% | 4.4% | 5.1% | 7.8% |
| *forecasts scored* | 120 | 100 | 70 | 10 |

**cost**

| Model | h=1 | h=3 | h=6 | h=12 |
|---|--:|--:|--:|--:|
| Baseline: `naive` | 5.4% | 9.6% | 14.2% | 7.4% |
| Baseline: `snaive` | 6.1% | 6.1% | 6.3% | 7.4% |
| Baseline: `snaive_growth` | 3.2% | 3.2% | 3.1% | 2.5% |
| Holt-Winters: `holt_winters(damped=False, seasonal=add, trend=None)` **(selected)** | 3.0% | 3.9% | 5.7% | 8.4% |
| Prophet: `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` | 2.9% | 3.1% | 3.3% | 4.4% |
| *Reference:* `v1 production model, no masking: prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` | 3.3% | 3.6% | 4.1% | 6.1% |
| *forecasts scored* | 120 | 100 | 70 | 10 |

**profit**

| Model | h=1 | h=3 | h=6 | h=12 |
|---|--:|--:|--:|--:|
| Baseline: `naive` | 37.8% | 58.5% | 44.8% | 17.4% |
| Baseline: `snaive` | 17.6% | 19.1% | 16.2% | 17.4% |
| Baseline: `snaive_growth` | 14.8% | 15.8% | 12.6% | 10.4% |
| Holt-Winters: `holt_winters(damped=False, seasonal=add, trend=None)` **(selected)** | 12.0% | 13.1% | 15.0% | 17.2% |
| Prophet: `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` | 11.9% | 12.9% | 10.8% | 10.2% |
| *Reference:* `v1 production model, no masking: prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` | 14.6% | 15.3% | 14.1% | 17.4% |
| *forecasts scored* | 120 | 100 | 70 | 10 |

## 4. Fixed origin: fitted on months up to 202508 only

Each model is fitted once at the end of the validation year and forecasts the whole test year (h = 1–12) without seeing any test month. This is the strict reading of "trained on the training split only".

| Model | Revenue MAPE | Cost MAPE | Profit MAPE |
|---|--:|--:|--:|
| Baseline: `naive` | 10.2% | 7.7% | 49.3% |
| Baseline: `snaive` | 7.2% | 6.1% | 17.6% |
| Baseline: `snaive_growth` | 3.9% | 3.3% | 14.8% |
| Holt-Winters: `holt_winters(damped=False, seasonal=add, trend=None)` **(selected)** | 5.2% | 4.4% | 13.4% |
| Prophet: `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` | 3.6% | 3.0% | 12.0% |
| *Reference:* `v1 production model, no masking: prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` | 4.1% | 3.4% | 15.1% |

## 5. Selected model by business unit, 1-month-ahead, test seeds

All overhead sits in `CP`, so business-unit profit is gross profit and CP profit is negative (MAPE is still defined against |actual|). A unit whose profit is close to zero, such as `TR` (trading margin eroding to about 1% in the canonical anomaly A10), gets a huge MAPE from small S$ errors; read its WAPE instead.

| Dept | Revenue MAPE | Cost MAPE | Profit MAPE | Profit WAPE |
|---|--:|--:|--:|--:|
| CP | – | 3.5% | 3.5% | 3.5% |
| CR | 6.7% | 6.3% | 7.9% | 8.2% |
| EN | 6.2% | 6.4% | 6.7% | 6.8% |
| FA | 5.5% | 5.2% | 9.0% | 8.8% |
| HL | 6.1% | 6.1% | 10.6% | 10.5% |
| MN | 5.9% | 5.9% | 6.4% | 6.5% |
| TP | 5.3% | 5.1% | 10.2% | 8.9% |
| TR | 7.4% | 8.5% | 988.2% | 47.4% |

## 6. Where the profit error comes from: 1-month-ahead profit APE by calendar month

Profit is a small difference of two large numbers, so a month with low profit turns a normal-sized S$ error into a large percentage. December carries the 13th-month payroll, so its profit is the lowest.

| Month | Mean APE | Mean actual profit |
|---|--:|--:|
| Jan | 7.0% | S$488k |
| Feb | 14.1% | S$401k |
| Mar | 13.7% | S$700k |
| Apr | 14.2% | S$791k |
| May | 8.5% | S$837k |
| Jun | 12.0% | S$854k |
| Jul | 5.9% | S$851k |
| Aug | 8.7% | S$860k |
| Sep | 6.4% | S$638k |
| Oct | 9.3% | S$685k |
| Nov | 12.8% | S$549k |
| Dec | 31.7% | S$182k |

## 7. Bottom-up vs a direct company-level model (selected method, 1-month-ahead MAPE)

Stored forecasts are per department and summed (bottom-up), so any filter adds up. This checks what that costs against forecasting the company total directly. Bottom-up is the more accurate of the two. With masking, a company-level model must drop a whole month whenever any unit is flagged, so it loses far more history than the unit models do.

| | Revenue | Cost | Profit |
|---|--:|--:|--:|
| Bottom-up (production) | 3.64% | 3.01% | 12.03% |
| Direct company total | 4.07% | 3.55% | 17.01% |

## 8. Stress test: random-mode ledgers (≈3× the anomaly rate), test seeds

The same seeds generated with the anomaly benchmark's dense random anomalies (one-off spikes, margin collapses, sustained drops). It shows how the forecast degrades on a much noisier ledger.

| Model | Revenue MAPE | Cost MAPE | Profit MAPE |
|---|--:|--:|--:|
| Baseline: `snaive` | 9.3% | 8.2% | 28.5% |
| Holt-Winters: `holt_winters(damped=False, seasonal=add, trend=None)` **(selected)** | 4.8% | 4.4% | 17.0% |

## 9. Validation (how the model was chosen)

Every candidate was fitted with anomalous months masked. One candidate forecasts revenue and cost; the one with the lowest worst company-level 1-month-ahead validation MAPE across revenue, cost and profit, pooled over the validation seeds; ties go to the simpler family.

| Candidate | Revenue | Cost | Profit | Worst |
|---|--:|--:|--:|--:|
| `holt_winters(damped=False, seasonal=add, trend=None)` **(selected)** | 3.3% | 2.9% | 15.2% | 15.2% |
| `holt_winters(damped=False, seasonal=add, trend=add)` | 3.3% | 2.8% | 15.9% | 15.9% |
| `holt_winters(damped=True, seasonal=add, trend=add)` | 3.3% | 2.9% | 16.0% | 16.0% |
| `holt_winters(damped=True, seasonal=mul, trend=add)` | 2.9% | 2.6% | 16.2% | 16.2% |
| `holt_winters(damped=False, seasonal=mul, trend=None)` | 3.3% | 2.9% | 16.5% | 16.5% |
| `holt_winters(damped=False, seasonal=mul, trend=add)` | 2.8% | 2.4% | 16.8% | 16.8% |
| `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` | 3.7% | 3.0% | 18.1% | 18.1% |
| `prophet(changepoint_prior_scale=0.1, seasonality_mode=additive)` | 3.7% | 3.0% | 18.5% | 18.5% |
| `prophet(changepoint_prior_scale=0.5, seasonality_mode=additive)` | 4.0% | 3.4% | 18.5% | 18.5% |
| `snaive` | 7.2% | 6.9% | 18.7% | 18.7% |
| `prophet(changepoint_prior_scale=0.01, seasonality_mode=multiplicative)` | 3.3% | 2.7% | 18.9% | 18.9% |
| `snaive_growth` | 3.4% | 2.9% | 18.9% | 18.9% |
| `prophet(changepoint_prior_scale=0.1, seasonality_mode=multiplicative)` | 3.4% | 2.7% | 20.1% | 20.1% |
| `prophet(changepoint_prior_scale=0.5, seasonality_mode=multiplicative)` | 3.8% | 3.0% | 21.4% | 21.4% |
| `naive` | 5.6% | 5.3% | 26.3% | 26.3% |
