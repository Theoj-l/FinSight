# Forecast model v1 — test report

Selected model: `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` (family Prophet), chosen on the validation window (202409, 202508) over seeds 31-40.
Test window 202509–202608, rolling origin, test seeds 41-50 (canonical mode) and the showcase dataset (seed 20260901, the data in Supabase).
Trained 2026-10-12T17:36:01 at git `7f183ac-dirty`. How to read this report: `training/forecast/METHODOLOGY.md` §8.

## 1. Target check (US3.5): 1-month-ahead MAPE ≤ 15%, company level

| Target | MAPE (test seeds) | WAPE | MAE | RMSE | Seed range (MAPE) | Showcase MAPE | ≤ 15%? |
|---|--:|--:|--:|--:|--:|--:|:-:|
| revenue | 3.7% | 3.8% | S$201k | S$262k | 2.7% – 4.3% | 4.7% | yes |
| cost | 3.0% | 3.1% | S$143k | S$182k | 2.4% – 3.8% | 3.6% | yes |
| profit | 15.5% | 13.3% | S$87k | S$109k | 10.3% – 26.2% | 12.9% | **no** |

**Not every target meets the threshold:** profit 15.50% on the test seeds, 12.88% on the showcase dataset. Per US3.5 this limitation must be disclosed in the UI (the forecast view shows each selection's live backtest accuracy and band) and to the sponsor. §6 shows where the profit error comes from.

## 2. Model comparison (US3.2, US3.3): 1-month-ahead, company level, test seeds

Skill = 1 − MAE / MAE of the seasonal naive. Positive means better than the seasonal naive.

| Model | Revenue MAPE | Cost MAPE | Profit MAPE | Profit WAPE | Revenue skill | Cost skill | Profit skill |
|---|--:|--:|--:|--:|--:|--:|--:|
| Baseline: `naive` | 5.7% | 5.1% | 38.8% | 22.6% | +18% | +13% | -16% |
| Baseline: `snaive` | 6.9% | 5.7% | 23.8% | 19.5% | +0% | +0% | +0% |
| Baseline: `snaive_growth` | 4.1% | 3.7% | 25.9% | 15.7% | +42% | +36% | +20% |
| Holt-Winters: `holt_winters(damped=False, seasonal=add, trend=None)` | 3.7% | 3.1% | 14.3% | 11.9% | +45% | +45% | +39% |
| Prophet: `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` **(selected)** | 3.7% | 3.0% | 15.5% | 13.3% | +45% | +46% | +32% |

## 3. Error by horizon (US3.3: longer-term trends), MAPE, test seeds

Targets after the test window are not scored, so longer horizons have fewer forecasts.

**revenue**

| Model | h=1 | h=3 | h=6 | h=12 |
|---|--:|--:|--:|--:|
| Baseline: `naive` | 5.7% | 11.7% | 16.5% | 8.7% |
| Baseline: `snaive` | 6.9% | 7.0% | 7.5% | 8.7% |
| Baseline: `snaive_growth` | 4.1% | 3.9% | 3.4% | 3.7% |
| Holt-Winters: `holt_winters(damped=False, seasonal=add, trend=None)` | 3.7% | 4.5% | 7.0% | 10.6% |
| Prophet: `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` **(selected)** | 3.7% | 3.9% | 4.6% | 6.7% |
| *forecasts scored* | 120 | 100 | 70 | 10 |

**cost**

| Model | h=1 | h=3 | h=6 | h=12 |
|---|--:|--:|--:|--:|
| Baseline: `naive` | 5.1% | 8.3% | 12.7% | 7.5% |
| Baseline: `snaive` | 5.7% | 5.7% | 5.6% | 7.5% |
| Baseline: `snaive_growth` | 3.7% | 3.7% | 4.0% | 3.1% |
| Holt-Winters: `holt_winters(damped=False, seasonal=add, trend=None)` | 3.1% | 3.7% | 5.6% | 9.6% |
| Prophet: `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` **(selected)** | 3.0% | 3.0% | 3.6% | 5.6% |
| *forecasts scored* | 120 | 100 | 70 | 10 |

**profit**

| Model | h=1 | h=3 | h=6 | h=12 |
|---|--:|--:|--:|--:|
| Baseline: `naive` | 38.8% | 56.9% | 41.5% | 17.0% |
| Baseline: `snaive` | 23.8% | 26.5% | 21.0% | 17.0% |
| Baseline: `snaive_growth` | 25.9% | 29.4% | 12.4% | 11.2% |
| Holt-Winters: `holt_winters(damped=False, seasonal=add, trend=None)` | 14.3% | 16.7% | 16.2% | 16.8% |
| Prophet: `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` **(selected)** | 15.5% | 16.8% | 14.2% | 13.3% |
| *forecasts scored* | 120 | 100 | 70 | 10 |

## 4. Fixed origin: fitted on months up to 202508 only

Each model is fitted once at the end of the validation year and forecasts the whole test year (h = 1–12) without seeing any test month. This is the strict reading of "trained on the training split only".

| Model | Revenue MAPE | Cost MAPE | Profit MAPE |
|---|--:|--:|--:|
| Baseline: `naive` | 9.5% | 7.1% | 47.0% |
| Baseline: `snaive` | 6.9% | 5.7% | 23.8% |
| Baseline: `snaive_growth` | 4.2% | 4.0% | 25.4% |
| Holt-Winters: `holt_winters(damped=False, seasonal=add, trend=None)` | 5.4% | 4.4% | 18.0% |
| Prophet: `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` **(selected)** | 3.7% | 3.0% | 16.3% |

## 5. Selected model by business unit, 1-month-ahead, test seeds

All overhead sits in `CP`, so business-unit profit is gross profit and CP profit is negative (MAPE is still defined against |actual|). A unit whose profit is close to zero, such as `TR` (trading margin eroding to about 1% in the canonical anomaly A10), gets a huge MAPE from small S$ errors; read its WAPE instead.

| Dept | Revenue MAPE | Cost MAPE | Profit MAPE | Profit WAPE |
|---|--:|--:|--:|--:|
| CP | – | 3.9% | 3.9% | 3.9% |
| CR | 5.6% | 5.5% | 8.1% | 8.2% |
| EN | 7.9% | 8.0% | 9.2% | 9.2% |
| FA | 5.0% | 5.2% | 10.7% | 11.1% |
| HL | 9.5% | 9.2% | 13.7% | 14.0% |
| MN | 6.2% | 6.3% | 6.3% | 6.4% |
| TP | 5.4% | 5.2% | 8.0% | 8.0% |
| TR | 5.3% | 8.5% | 483.3% | 79.3% |

## 6. Where the profit error comes from: 1-month-ahead profit APE by calendar month

Profit is a small difference of two large numbers, so a month with low profit turns a normal-sized S$ error into a large percentage. December carries the 13th-month payroll, so its profit is the lowest.

| Month | Mean APE | Mean actual profit |
|---|--:|--:|
| Jan | 13.7% | S$498k |
| Feb | 8.2% | S$430k |
| Mar | 18.0% | S$706k |
| Apr | 16.1% | S$821k |
| May | 16.6% | S$855k |
| Jun | 16.2% | S$840k |
| Jul | 7.5% | S$820k |
| Aug | 9.4% | S$813k |
| Sep | 13.3% | S$631k |
| Oct | 7.0% | S$679k |
| Nov | 5.9% | S$563k |
| Dec | 53.9% | S$183k |

## 7. Bottom-up vs a direct company-level model (selected method, 1-month-ahead MAPE)

Stored forecasts are per department and summed (bottom-up), so any filter adds up. This checks what that costs against forecasting the company total directly. The two are almost equal because an additive model is close to linear in its input: the sum of the departments' fits is nearly the fit of the sum.

| | Revenue | Cost | Profit |
|---|--:|--:|--:|
| Bottom-up (production) | 3.66% | 3.01% | 15.50% |
| Direct company total | 3.66% | 3.01% | 15.48% |

## 8. Stress test: random-mode ledgers (≈3× the anomaly rate), test seeds

The same seeds generated with the anomaly benchmark's dense random anomalies (one-off spikes, margin collapses, sustained drops). It shows how the forecast degrades on a much noisier ledger.

| Model | Revenue MAPE | Cost MAPE | Profit MAPE |
|---|--:|--:|--:|
| Baseline: `snaive` | 8.6% | 7.6% | 49.7% |
| Prophet: `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` **(selected)** | 4.7% | 4.3% | 49.6% |

## 9. Validation (how the model was chosen)

One candidate forecasts revenue and cost; the one with the lowest worst company-level 1-month-ahead validation MAPE across revenue, cost and profit, pooled over the validation seeds; ties go to the simpler family.

| Candidate | Revenue | Cost | Profit | Worst |
|---|--:|--:|--:|--:|
| `prophet(changepoint_prior_scale=0.01, seasonality_mode=additive)` **(selected)** | 3.9% | 3.4% | 20.1% | 20.1% |
| `prophet(changepoint_prior_scale=0.01, seasonality_mode=multiplicative)` | 4.3% | 3.8% | 22.6% | 22.6% |
| `snaive` | 8.8% | 7.6% | 22.9% | 22.9% |
| `holt_winters(damped=False, seasonal=add, trend=None)` | 4.6% | 3.5% | 23.0% | 23.0% |
| `prophet(changepoint_prior_scale=0.1, seasonality_mode=additive)` | 4.3% | 3.4% | 23.1% | 23.1% |
| `naive` | 5.6% | 5.5% | 23.3% | 23.3% |
| `snaive_growth` | 6.1% | 4.6% | 23.7% | 23.7% |
| `holt_winters(damped=True, seasonal=mul, trend=add)` | 4.3% | 3.4% | 23.9% | 23.9% |
| `holt_winters(damped=True, seasonal=add, trend=add)` | 4.2% | 3.5% | 24.6% | 24.6% |
| `holt_winters(damped=False, seasonal=mul, trend=add)` | 4.3% | 3.2% | 24.7% | 24.7% |
| `holt_winters(damped=False, seasonal=mul, trend=None)` | 4.8% | 3.8% | 24.8% | 24.8% |
| `holt_winters(damped=False, seasonal=add, trend=add)` | 4.4% | 3.5% | 25.8% | 25.8% |
| `prophet(changepoint_prior_scale=0.1, seasonality_mode=multiplicative)` | 5.9% | 4.5% | 28.4% | 28.4% |
| `prophet(changepoint_prior_scale=0.5, seasonality_mode=additive)` | 4.9% | 3.7% | 28.5% | 28.5% |
| `prophet(changepoint_prior_scale=0.5, seasonality_mode=multiplicative)` | 5.7% | 4.4% | 33.8% | 33.8% |
