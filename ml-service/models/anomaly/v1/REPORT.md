# FinSight anomaly model v1 — evaluation report

- Trained 2026-10-08T20:35:07 from git `ded048c` · dataset v1.1 · Python 3.14.7, scikit-learn 1.9.1, pandas 3.0.5, numpy 2.5.2
- Seeds: train 1–30 (30), validation 31–40 (10), **test 41–50 (10)**, showcase `20260901` (canonical A01–A10)
- Review budget (alerts per company-month, set on validation seeds): business unit 2.0, expense account 1.5, customer 1.5
- Scored window: 56 months per company (2022-01 → 2026-08); 2021 is baseline history only
- Method and definitions: `training/anomaly/METHODOLOGY.md`. All data is synthetic.

## 1. Headline (test seeds, combiner)

- **97% of 335 anomalies detected** (at least one alert inside the anomaly's footprint)
- 3.0 alerts per company-month, of which 94% point at a labelled anomaly
- Unlabelled look-alikes alerted: 1%

## 2. Method comparison (test seeds)

Same features, same data, same review budget; only the scoring method differs. Average precision (AP) is threshold-free; the other columns are at the operating threshold.

| Method | Event recall | Alert precision | Alerts / month | AP business unit | AP expense acct | AP customer | Decoys alerted |
|---|--:|--:|--:|--:|--:|--:|--:|
| Rules only | 53% | 100% | 1.59 | 0.270 | 0.668 | 0.741 | 0% |
| Robust statistics | 67% | 38% | 2.85 | 0.565 | 0.127 | 0.160 | 24% |
| Isolation Forest | 90% | 78% | 3.17 | 0.612 | 0.648 | 0.910 | 67% |
| **Combiner (GBM)** | 97% | 94% | 2.99 | 0.906 | 0.998 | 0.947 | 1% |

Rules only fire on hard accounting breaks, so they do not use the budget; the other methods are thresholded to it.

## 3. Recall by anomaly type (test seeds)

| Anomaly type | n | Rules only | Robust statistics | Isolation Forest | **Combiner (GBM)** | Median delay (combiner) |
|---|--:|--:|--:|--:|--:|--:|
| one_off_spike | 40 | 0% | 95% | 88% | 95% | 0.0 mo |
| sustained_drop | 24 | 0% | 54% | 58% | 83% | 0.0 mo |
| cost_overrun | 34 | 0% | 82% | 71% | 94% | 0.0 mo |
| gradual_erosion | 24 | 0% | 100% | 100% | 100% | 2.0 mo |
| duplicate_payment | 30 | 100% | 0% | 100% | 100% | 0.0 mo |
| outlier_charge | 34 | 0% | 68% | 74% | 91% | 0.0 mo |
| wrong_department | 41 | 100% | 93% | 100% | 100% | 0.0 mo |
| revenue_cutoff | 39 | 100% | 10% | 100% | 100% | 0.0 mo |
| round_number_journal | 37 | 100% | 70% | 100% | 100% | 0.0 mo |
| customer_delinquency | 32 | 97% | 100% | 100% | 100% | 2.5 mo |

## 4. Recall by difficulty (test seeds)

Difficulty bands come from the injected magnitude (METHODOLOGY.md §3).

| Difficulty | n | Rules only | Robust statistics | Isolation Forest | **Combiner (GBM)** |
|---|--:|--:|--:|--:|--:|
| easy | 131 | 44% | 82% | 95% | 99% |
| medium | 119 | 61% | 64% | 88% | 97% |
| hard | 85 | 56% | 51% | 85% | 93% |

## 5. Per business-unit / account / customer view (test seeds, combiner)

| Unit kind | Units | Positive units | AP | Alerts / month | Precision | Unit recall |
|---|--:|--:|--:|--:|--:|--:|
| business unit | 3,920 | 677 | 0.906 | 1.13 | 87% | 82% |
| expense account | 8,020 | 101 | 0.998 | 0.18 | 97% | 97% |
| customer | 127,964 | 1,006 | 0.947 | 1.68 | 98% | 92% |

## 6. Showcase: canonical dataset (seed 20260901, A01–A10)

Never used for training, tuning or thresholds. One row per labelled anomaly.

| id | type | where | period | Rules only | Robust statistics | Isolation Forest | **Combiner (GBM)** | first alert (combiner) | evidence |
|---|---|---|---|---|---|---|---|---|---|
| A01 | one_off_spike | HL / 4200 | 202307 | ❌ | ✅ | ✅ | ✅ | 202307 (+0 mo) | revenue 10.3 robust SDs above its trailing 12 months |
| A02 | sustained_drop | EN / 4300 | 202403–202408 | ❌ | ✅ | ✅ | ✅ | 202403 (+0 mo) | revenue 4.8 robust SDs below its trailing 12 months; revenue persistently below last year's pattern (CUSUM 4.5) |
| A03 | cost_overrun | CR / 5100 | 202209 | ❌ | ✅ | ✅ | ✅ | 202209 (+0 mo) | gross margin 10% vs typical 34% |
| A04 | duplicate_payment | CP / 6200 | 202311 | ✅ | ❌ | ✅ | ✅ | 202311 (+0 mo) | monthly total 104,715 is 2.1x its trailing median (z 21.4); the same amount was posted twice within 3 days; 2 postings this month, usually 1 |
| A05 | outlier_charge | CP / 6800 | 202503 | ❌ | ✅ | ✅ | ✅ | 202503 (+0 mo) | monthly total 224,882 is 12.4x its trailing median (z 159.4); 2 postings this month, usually 1 |
| A06 | wrong_department | FA / 5400 | 202406 | ✅ | ✅ | ✅ | ✅ | 202406 (+0 mo) | gross margin -17% vs typical 25%; 19% of the unit's revenue/cost is on an account this unit has never used |
| A07 | revenue_cutoff | EN / 4300 | 202412 | ✅ | ✅ | ✅ | ✅ | 202412 (+0 mo) | GL revenue differs from sales invoices by +27.3%; revenue persistently below last year's pattern (CUSUM 17.7) |
| A08 | round_number_journal | CP / 6900 | 202212 | ✅ | ❌ | ✅ | ✅ | 202212 (+0 mo) | round-number journal of 100,000 at month end; monthly total 103,489 is 31.8x its trailing median (z 6.0) |
| A09 | customer_delinquency | C0122 / 1200 | 202409–202608 | ✅ | ✅ | ✅ | ✅ | 202411 (+2 mo) | days past due 62 vs the customer's own history (z 12.1); collected 0% of the last 90 days' billing |
| A10 | gradual_erosion | TR / 5600 | 202401–202512 | ❌ | ✅ | ✅ | ✅ | 202407 (+6 mo) | weaker signals: gross-margin shortfall CUSUM +5.3, gross-margin z vs 12m -2.6 |

Combiner on the showcase: 57 alerts over 56 months (1.02 / month); 53 inside a labelled footprint, 4 elsewhere. Unlabelled look-alikes alerted: 0%. All alerts with reasons: `showcase_alerts.csv`.

Highest-scoring alerts outside any labelled anomaly (what a reviewer would also see):

| period | unit | score | evidence |
|---|---|--:|---|
| 202204 | business unit EN | 0.50 | gross margin 37% vs typical 40% |
| 202307 | business unit TR | 0.49 | gross margin 8% vs typical 12% |
| 202501 | customer C0085 | 0.42 | days past due 48 vs the customer's own history (z 9.6); no receipt for 234 days (usually every 71) |
| 202201 | business unit TR | 0.40 | weaker signals: gross-margin z vs 12m -5.9, gross-margin shortfall CUSUM +7.0 |

## 7. Missed test anomalies (combiner): 11 of 335

| seed | id | type | difficulty | where | period |
|---|---|---|---|---|---|
| 50 | R018 | cost_overrun | easy | TR | 202406 |
| 46 | R012 | cost_overrun | hard | TR | 202401 |
| 46 | R007 | one_off_spike | hard | HL | 202301 |
| 43 | R012 | one_off_spike | medium | TP | 202502 |
| 44 | R028 | outlier_charge | hard | CP | 202501 |
| 49 | R030 | outlier_charge | hard | CP | 202202 |
| 43 | R026 | outlier_charge | medium | CP | 202502 |
| 43 | R005 | sustained_drop | hard | TP | 202405–202410 |
| 44 | R004 | sustained_drop | hard | EN | 202311–202402 |
| 45 | R005 | sustained_drop | medium | MN | 202204–202209 |
| 50 | R006 | sustained_drop | medium | FA | 202201–202206 |

## 8. Chosen settings

| Unit kind | Combiner (learning rate / trees / leaves) | Validation AP | Threshold (combiner) |
|---|---|--:|--:|
| business unit | 0.05 / 200 / 15 | 0.884 | 0.303 |
| expense account | 0.1 / 400 / 15 | 0.999 | 0.113 |
| customer | 0.05 / 200 / 15 | 0.935 | 0.352 |
