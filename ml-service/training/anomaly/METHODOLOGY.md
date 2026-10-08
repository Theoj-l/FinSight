# FinSight anomaly detection — methodology

How the anomaly model is trained and tested: where the labelled data comes
from, how seeds are used, what the model sees, how it is fitted, and how the
results are measured. Every number quoted here comes from the code named next to it,
so each claim can be checked.

| | |
|---|---|
| Data generator | `ml-service/datagen/` (dataset **v1.1**; changelog in `datagen/DATA_MODEL.md` §10) |
| Feature and model code | `ml-service/app/anomaly/` (shipped with the serving image) |
| Training and evaluation | `ml-service/training/anomaly/` (offline only) |
| Artifacts and report | `ml-service/models/anomaly/v1/` (gitignored; rebuild with §10) |

---

## 0. Results at a glance (model v1, trained 2026-09-23)

Held-out **test seeds 41–50** (10 synthetic companies, 335 injected anomalies,
56 scored months each). The alert threshold for every method was chosen on
the validation seeds (§7.4).

| Method | Anomalies detected | Alerts that are real | Alerts per company-month | Look-alikes alerted |
|---|--:|--:|--:|--:|
| Rules only | 53% | 100% | 1.6 | 0% |
| Robust statistics | 67% | 38% | 2.9 | 24% |
| Isolation Forest | 90% | 78% | 3.2 | 67% |
| **Supervised combiner** | **97%** | **94%** | 3.0 | 1% |

On the **canonical showcase dataset** (seed `20260901`, anomalies A01–A10,
the data in Supabase, never used for training or tuning), the combiner detects
**10 of 10**. It raises 57 alerts over 56 months, and 53 of them fall inside a
labelled anomaly.

These are results on synthetic data whose normal behaviour is smoother than a
real ledger. Read them as an upper bound, not a forecast for TSH's books (§9).
The full breakdown is in `models/anomaly/v1/REPORT.md`.

---

## 1. Why synthetic data with randomised injection

**The problem.** A supervised model needs many labelled examples. It also needs
test data it has never seen. The original dataset (v1.0) had ten labelled
anomalies, A01–A10, at hard-coded dates. Every seed placed the same ten
anomalies in the same cells, so a different seed produced no new information
about anomalies. With ten positives, any train/test split is anecdotal. It is
also too easy to tune a detector until it finds exactly those ten.

**The approach.**

1. Turn each of the ten anomaly types into a **template** with parameters for
   where, when and how large.
2. For each **seed**, generate a complete, independent 68-month company history
   with 23–40 anomalies (32 on average) drawn from the templates at random.
3. Split by seed. Train on some companies, tune on others, report on still others.
4. Keep the canonical A01–A10 dataset as a **showcase**. It is never used for
   training or tuning.

This gives 952 labelled training anomalies instead of 10. Every reported
number comes from companies the model has never seen.

### 1.1 Leakage audit (why the data was regenerated as v1.1)

Before any modelling we checked whether an anomaly could be found *without*
looking at its accounting content. Five such shortcuts existed. Each would have
made any model look nearly perfect for the wrong reason. All five are fixed,
and tests stop them coming back.

| # | Shortcut found in v1.0 | Fix in v1.1 | Guard |
|---|---|---|---|
| 1 | Injected journals had a unique `journal_type`/`source_type` pair (`PAYMENT/J`, `SALES/J`). Only 6 rows in the whole ledger had it, and all 6 were anomalies. They also had `ref_no1 = ANOM-*` / `DUP-AP` and self-describing narratives such as "(duplicate)" and "(unbilled)". | Injected journals use the same conventions and wording as normal postings of the same kind: `PAYMENT/P "Expense 6800"`, `GENERAL/J "Month-end accrual adjustment"`, and so on. | `validate.py` hard checks; `tests/test_datagen_no_leakage.py` |
| 2 | Injected journals were posted after the simulation. They held the **highest** `gl_trx_id` / `gl_dtl_key` values, out of date order. | Journals are posted inside their own month, and all keys are renumbered by `trans_date` (random tie-break within a day). | `validate.py`: keys follow the calendar |
| 3 | A04 "duplicate payment" was not a duplicate: there was no original S$84,500 payment. | A04 re-posts a real `Expense 6200` payment with the same date, amount and narrative. | `tests/test_datagen_plan.py::test_a04_is_a_real_duplicate` |
| 4 | Invoice numbers restarted for each business unit, giving 10,315 duplicate `doc_no`s. A receipt (`ref_no1 = doc_no`) could not be linked to its invoice. | One invoice counter per month across all units, so `doc_no` is unique. | `validate.py`: `doc_no` unique |
| 5 | Found by the new tests: in canonical mode, the narrative "Direct cost accrual" appeared only on A06. | Both modes now post unlabelled **look-alikes** (§3.3) that share the same narratives. | `test_injected_narratives_are_shared_with_normal_postings` |

A sixth shortcut is avoided in the feature code. **`ar_invoice.outstanding`
is a snapshot at the extract date (2026-08-31).** Using it as a feature for an
earlier month would leak the future. Receivable positions are therefore
rebuilt month by month from invoices and GL receipts (§5.3).

As a last line of defence, the models can only see an explicit **feature
allow-list**. Keys, references, narratives, codes and dates are banned outright
(`schema.BANNED_COLUMNS`, enforced by `tests/test_anomaly_allowlist.py`).

---

## 2. Seeding scheme

Everything is deterministic. A `(seed, mode)` pair always produces exactly the
same dataset. The code is `datagen/pipeline.py::generate`.

| Random stream | Drives | Created as |
|---|---|---|
| **Simulation stream** | masters (250 customers, 12 agents), every invoice, payment, expense and noise draw | `numpy.random.default_rng(seed)` |
| **Anomaly stream** | where, when and how big each random anomaly is; placement of look-alikes (both modes) | `numpy.random.default_rng([seed, 1])` |

The anomaly stream is separate, so choosing anomalies never uses up draws
from the simulation stream. The same seed therefore always has **the same
customers and agents** whether its anomalies are canonical or random. This is
enforced by `test_same_seed_same_masters_in_both_modes`. Injected anomalies do
change the business itself (a revenue spike creates more invoices), so the
ledgers of the two modes differ after the first anomaly. That is intended.

### 2.1 Seed roles

| Role | Seeds | Anomaly mode | Used for |
|---|---|---|---|
| **Train** | 1–30 | random | fitting the Isolation Forests and the combiners |
| **Validation** | 31–40 | random | choosing combiner hyper-parameters and every alert threshold |
| **Test** | 41–50 | random | the reported results; used once, by `evaluate.py` |
| **Showcase** | `20260901` (`DEFAULT_SEED`) | canonical A01–A10 | demonstration on the dataset loaded in Supabase |

The seed ranges are defined in `training/anomaly/bench.py`.

**Why the split is by seed and not by row or month.** Anomaly data is
correlated in time and across entities. A month's baseline is built from the
months before it, and a customer appears in every month. If rows from one
company were split between train and test, the model would be tested on months
whose neighbours it had already seen. Splitting by seed makes every test
company fully unseen. This is the synthetic version of "train on some
companies' ledgers, test on another company's ledger".

### 2.2 Reproducing any dataset

```bash
cd ml-service && source venv/bin/activate
python -m datagen --anomalies random --seed 7 --out /tmp/seed7   # benchmark seed 7 as CSVs
python -m datagen                                                # canonical showcase -> datagen/output/
```

Each output directory contains `datagen_anomaly_log.csv` (labels),
`decoy_log.csv` (look-alikes, random mode) and `VALIDATION.txt`. Training does
not read these files: it regenerates every seed in memory in about 1 s.

---

## 3. What gets injected

Code: `datagen/anomalies.py`.

### 3.1 The ten templates

Each random seed receives the listed number of instances of every template.
Sizes are drawn uniformly from the given ranges. The **difficulty band**
describes the size of the injected change and is used to report recall by
difficulty. In random mode, severity follows difficulty (easy → high,
medium → medium, hard → low). The canonical A01–A10 keep their original
severities.

| Template (subtype) | Per seed | Where | Size drawn | easy / medium / hard |
|---|--:|---|---|---|
| `one_off_spike` (revenue) | 2–5 | any business unit (BU), 1 month | revenue ×1.25–3.0 | ≥2.0 / 1.5–2.0 / <1.5 |
| `sustained_drop` (revenue) | 1–3 | any BU, 3–8 months | revenue ×0.62–0.88 | ≤0.70 / ≤0.80 / >0.80 |
| `cost_overrun` (margin) | 2–5 | any BU, 1 month | gross margin → 25–65% of baseline | ≤40% / ≤55% / >55% |
| `gradual_erosion` (margin) | 1–3 | any BU, 9–24 months | margin ramps linearly to 10–50% of baseline | ≤25% / ≤40% / >40% |
| `duplicate_payment` (expense) | 2–5 | a cash opex account's real monthly payment, re-posted 0–3 days later | the real amount | ≥S$20k / ≥S$5k / <S$5k |
| `outlier_charge` (expense) | 2–5 | opex account except 6900, extra payment on another weekday | month total 3–15× normal | ≥8× / ≥5× / <5× |
| `wrong_department` (posting error) | 2–5 | BU *a*'s direct-cost account posted to dept *b* (manual accrual) | S$30k–200k | ≥120k / ≥60k / <60k |
| `revenue_cutoff` (posting error) | 2–5 | any BU, manual revenue accrual Dr 1200 / Cr 4xxx with no invoice, last 3 days of month | 5–30% of the month's expected revenue | ≥20% / ≥10% / <10% |
| `round_number_journal` (posting error) | 2–5 | 6900 / 6220 / 6500 / 6600 vs accruals, last 3 days of month | S$25k–200k in round figures | ≥100k / ≥50k / <50k |
| `customer_delinquency` (receivables) | 2–4 | a customer not in the chronic-late segment stops paying invoices due from a random month (2022-03 … 2025-12) to the end of the data | — | primary BU avg invoice ≥40k / ≥20k / <20k |

6900 (sundry) is excluded from outlier charges because its normal month-end
accrual adjustments swing it by ±S$50k. A 3–15× charge on its ~S$3k base
would be buried in that noise.

### 3.2 Placement rules

- **Window.** Random anomalies start in 2022-01 or later, so every detector
  has at least 12 months of clean history first. Point anomalies end by
  2026-06. Sustained ones may run to the end of the data (2026-08).
- **No overlaps.** Each anomaly reserves its *cells*: a BU dept-month, a
  Corporate (CP) account-month, or a customer. It also reserves a ±1-month
  buffer. Candidates that collide are redrawn, up to 300 tries. This keeps
  every label unambiguous: one alert can match at most one anomaly
  (`AnomalyPlan.claim`, `cells_of`).
- Long templates are placed first (erosion, then drops, then delinquency) so
  they can still find room.

### 3.3 Look-alikes (hard negatives)

Normal ledgers are full of events that look suspicious but are legitimate.
Without them, a model learns shortcuts such as "any manual journal is an
anomaly". Both modes post 3–8 of each kind below. They are **not labelled**,
they never touch a labelled cell, and they are listed in `decoy_log.csv` for
false-positive analysis.

| Kind | Imitates | What is posted |
|---|---|---|
| `second_payment` | outlier charge, duplicate | a second, smaller payment (10–40% of normal) to an opex account on another day |
| `direct_cost_accrual` | wrong department | the same "Direct cost accrual" journal, but in the **correct** BU (3–12% of its monthly cost) |
| `round_deposit` | round-number journal | a S$2k–20k round-figure deposit (Dr 1210 / Cr 1010) |
| `round_accrual` | round-number journal | a S$5k–20k round-figure "Month-end accrual adjustment" at month end |

There is no look-alike for `revenue_cutoff`. In this ledger model, a revenue
journal without an invoice *is* the reconciliation break. A benign version
cannot exist (§9).

---

## 4. What the model scores: alert units and labels

### 4.1 Alert units

An alert is raised on a **unit-month**: the thing an accountant would open and
review. Code: `app/anomaly/schema.py` and `features/`.

| Unit kind | Key | One row per | Typical anomalies |
|---|---|---|---|
| `dept` (business unit) | CR, HL, EN, TP, FA, TR, MN (the departments that earn revenue) | BU × month | spikes, drops, cost overruns, erosion, wrong department, cut-off |
| `acc` (expense account) | a 6xxx account on dept CP | account × month in which it was used | duplicates, outlier charges, round-number journals |
| `cust` (customer) | debtor code | customer × month with an open balance or recent billing | delinquency |

Only months from **2022-01** onwards are scored and trained on
(`FIRST_SCORED_PERIOD`). 2021 serves purely as baseline history.

### 4.2 Labels

Code: `training/anomaly/labels.py`. A unit-month is **positive** if it lies
inside an anomaly's footprint, which is the same set of cells datagen reserved
for it:

- BU anomalies → `("dept", BU, each month in [start, end])`
- Corporate postings → `("acc", account, each month in [start, end])`
- Delinquency → `("cust", customer, each month in [start, end])`

**Onset lag.** In the first month of a delinquency, the invoices falling due
are not yet late, so nothing is observable. That month is labelled positive
for evaluation but excluded from training (`train_ok = False`). Training on it
would teach the model noise.

Training rows: 11,760 BU-months (1,835 positive), 24,060 account-months
(312 positive) and 383,453 customer-months (3,080 positive), across 30 seeds.

---

## 5. Features

Two rules apply to every feature:

- **Causal.** A feature for month *t* uses only data dated on or before the
  last day of *t*. Baselines use months strictly before *t*.
  `tests/test_anomaly_features_causal.py` proves this. It rebuilds all features
  from the ledger cut off at 2022-12 and 2024-06 and checks that every earlier
  row is identical.
- **Scale-free.** Features are robust z-scores, ratios and log-ratios against
  the series' own history, never raw S$ amounts. This gives the model a
  chance to transfer to a ledger of a different size.

The building blocks are in `app/anomaly/detectors/series.py`:

| Statistic | Definition (month *t*) |
|---|---|
| robust z (12m) | (x_t − median(x_{t−12..t−1})) / scale. The scale is 1.4826·MAD over the same window, floored at 5% of \|median\| (money series) or an absolute floor (ratios). At least 6 months of history are required. |
| year-on-year log-ratio | log(x_t / x_{t−12}). This removes trend and seasonality in one step. |
| year-on-year z | robust z of the year-on-year log-ratio against its previous 24 months (absolute floor 0.02). |
| level shift | log( mean(x_{t−2..t}) / median(x_{t−15..t−4}) ) |
| CUSUM (Page 1954) | S⁺_t = max(0, S⁺_{t−1} + z_t − 0.5) and S⁻ similarly, on year-on-year z capped at ±5. |
| Mann–Kendall z | Kendall's τ between gross margin and time over the last 12 months, divided by its null SD √(2(2n+5)/(9n(n−1))). At least 9 months are required. |
| Theil–Sen slope | median pairwise slope of gross margin over 12 months, ×12 (points per year) |
| shift vs a year ago | median(last 3 months) − median(months t−24 … t−13) |

The CUSUMs use year-on-year residuals rather than the 12-month z. A unit with
a steady trend (TR shrinks 6% a year by design) sits permanently below its
trailing median. A trailing-baseline CUSUM would build up forever and fire on
every month. That was observed and fixed during development.

### 5.1 Business-unit features (`features/ledger.py`)

Computed from `pbalance` on the *natural* sign (revenue as a positive credit,
cost as a positive debit). The unit's revenue is the sum of its 4xxx accounts
and its cost of sales is the sum of its 5xxx accounts, including cost accounts
that are "foreign" to it.

| Feature | Meaning |
|---|---|
| `rev_z12`, `rev_zyoy`, `rev_level`, `rev_cusum_pos`, `rev_cusum_neg` | revenue: point, year-on-year, level-shift and CUSUM tests |
| `cost_z12`, `cost_zyoy` | the same for cost of sales |
| `gm`, `gm_dev12`, `gm_z12` | gross margin 1 − cost/revenue: its level, its change from the 12-month median, and its robust z |
| `gm_shift`, `gm_mkz12`, `gm_slope12`, `gm_cusum_neg` | margin trend tests (for erosion) |
| `recon_gap` | (GL revenue − Σ `iv_dtl.local_sub_total`) / invoiced revenue, for the dept-month: the GL-to-sales-sub-ledger reconciliation |
| `new_pair_share`, `min_pair_freq` | share of the unit's revenue and cost booked on an account it used in fewer than 10% of prior months, and the lowest such usage rate: account-dept coherence |
| `n_manual`, `n_manual_dev`, `manual_share` | count of manual (GENERAL) journals touching the unit, the change from its norm, and the share of the amount that did not come from invoices |
| `max_line_ratio`, `max_jscore` | largest line relative to its cell's usual line size, and the highest journal Isolation Forest score |

### 5.2 Expense-account features (`features/ledger.py`, `features/journal.py`)

| Feature | Meaning |
|---|---|
| `z12`, `zyoy`, `log_ratio_med12`, `cusum_pos` | monthly total vs its own history |
| `n_journals`, `n_journals_dev` | number of postings this month and the change from the account's norm |
| `max_line_share`, `max_line_ratio` | share of the month taken by the largest posting, and how large that posting is relative to normal |
| `max_trailing_zeros`, `round_month_end` | roundness of the amounts (100,000.00 → 5 zeros), and log-size of any round figure (≥3 zeros) posted in the last 3 days of the month |
| `dup_max` | other journals with the same account, dept and amount (to the cent) within ±3 days, never looking past the month end |
| `max_jscore` | highest journal Isolation Forest score |

### 5.3 Customer features (`features/receivables.py`)

The position at each month end is **rebuilt** from invoices (doc date, due
date, amount) and GL receipts (RECEIPT lines crediting 1200, linked to their
invoice by `ref_no1 = doc_no`). Lateness is measured on **wholly unpaid**
invoices. Short-payment residuals (invoices settled at 80–97%) stay open
indefinitely and would otherwise dominate the days-past-due figures. They are
a dispute, not delinquency.

| Feature | Meaning |
|---|---|
| `log_outstanding`, `out_growth_3m` | open balance and its 3-month growth |
| `overdue30_share`, `overdue90_share`, `n_open`, `n_overdue30` | how much of the unpaid amount is overdue |
| `wavg_dpd`, `dpd_excess`, `dpd_z` | amount-weighted days past due; the same compared with the customer's usual lateness; and its robust z against the customer's own history |
| `days_since_receipt`, `gap_ratio` | time since the last receipt, and that time relative to the customer's usual gap between receipts |
| `collect_ratio_90`, `log_billed_90` | receipts ÷ billing over the last 90 days, and billing volume |

### 5.4 Journal-line features (input to the journal Isolation Forest)

One row per P&L `gl_dtl` line:

- log amount
- amount ÷ the cell's trailing-12-month median line size
- trailing zeros
- month-end flag and day of month
- journal type
- number of lines in the journal
- how often the account/dept pair has been used
- duplicate count
- contra-side flag (e.g. a debit to revenue)

---

## 6. Detectors and the combiner

Four scoring methods run on the same features. The first three need no
labels. Keeping all four makes it possible to measure what supervision
actually adds.

| Method | Code | What it is | Why it exists |
|---|---|---|---|
| **Rules** | `detectors/rules.py::rule_flags` | Hard accounting checks: \|recon_gap\| > 0.5%; new account/dept pair > 2% of the unit; exact duplicate; round figure ≥ S$25k at month end; customer with > 50% of unpaid amount 90+ days overdue and no receipt for 120+ days | What an auditor checks by hand. Exact, but blind to anything that is not a rule break. |
| **Robust statistics** | `detectors/rules.py::stat_score` | the largest directional robust statistic of the unit (revenue z-scores, margin z / trend, CUSUMs; account z-scores; customer days-past-due z) | classical statistical process control; fully explainable |
| **Isolation Forest** | `detectors/iforest.py` | Liu et al. (2008). One per unit kind: 300 trees, 256 samples per tree, fitted on training units with missing values set to the training median. Its journal-level twin (200 trees, 512 samples, fitted on 300k sampled training lines) supplies `max_jscore`. | the standard unsupervised method for tabular anomaly detection, and a strong label-free baseline |
| **Combiner** | `model.py`, fitted in `train.py` | one `HistGradientBoostingClassifier` per unit kind, over all allow-listed features, including `max_jscore` | learns which combinations of signals matter and how large they need to be, separating anomalies from look-alikes |

Gradient-boosted trees suit this data. The training set is small and tabular.
Boosted trees handle missing values natively (early months have no
year-on-year history), need no feature scaling, and are robust to features
with very different ranges.

**Reasons.** Every alert carries plain-English evidence, strongest first
(`rules.reasons`). For example: "gross margin 10% vs typical 34%", "the same
amount was posted twice within 3 days", "no receipt for 141 days (usually
every 47)". If nothing crosses a headline threshold, the reason lists the
strongest weaker signals instead.

---

## 7. Training procedure

The code is `training/anomaly/train.py`. It runs in about 80 s on an 8-core laptop.

1. **Generate and featurise** seeds 1–40 in memory, in parallel. Each seed
   takes about 1 s to generate and about 1.5 s to featurise.
2. **Journal Isolation Forest.** Fit it on 300,000 lines sampled from the
   training seeds. Labels are not used. Then score every line of every seed
   and roll the maximum up to the units as `max_jscore`.
3. **Unit Isolation Forests.** Fit one per unit kind on all training units.
   Labels are not used.
4. **Combiners.** For each unit kind, fit on the training units where
   `train_ok` is true. Parameters are fixed as follows:
   - `min_samples_leaf = 20`
   - `l2_regularization = 1.0`
   - no early stopping
   - `random_state = 0`

   The remaining hyper-parameters are chosen on the validation seeds, by
   average precision, from this grid:

   | Hyper-parameter | Values tried |
   |---|---|
   | learning rate | 0.05, 0.1 |
   | number of trees | 200, 400 |
   | maximum leaves | 15, 31 |

   This gives 8 combinations per unit kind. The combiners are fitted on the
   training seeds only. Validation stays clean for step 5.
5. **Thresholds.** For every method and unit kind, pick the score threshold
   with the best unit-level F1 on the validation seeds. The chosen threshold
   may not raise more alerts than the **review budget** allows:
   - 2.0 BU alerts per company-month
   - 1.5 expense-account alerts per company-month
   - 1.5 customer alerts per company-month

   The budget is a *ceiling*, not a quota. A method that is confident about
   fewer units raises fewer alerts. Every method, rules included, goes through
   the same procedure. Rules can never alert with zero rules fired.
   (An earlier version spent the budget as a quota. That pushed thresholds
   down into noise and flagged 97% of look-alikes, so it was replaced.)
6. **Save** `models/anomaly/v1/model.joblib` and `meta.json`. The metadata
   records:
   - seeds, grid results, chosen parameters and thresholds
   - row counts and validation metrics
   - library versions and git SHA
   - the exact command

---

## 8. Evaluation protocol

The code is `training/anomaly/evaluate.py` and `metrics.py`. It runs in about 16 s.

The saved model, unchanged, is applied to test seeds 41–50 and to the
canonical showcase.

### 8.1 Metrics

| Metric | Definition | Why |
|---|---|---|
| **Event recall** | share of anomalies with at least one alert inside their footprint | "did we catch it?" — what the business cares about |
| **Detection delay** | months from the anomaly's start to its first alert | matters for sustained drops, erosion and delinquency |
| **Alert precision** | share of alerts that fall inside some anomaly's footprint | reviewer time wasted on false alarms |
| **Alerts per company-month** | alerts ÷ (seeds × 56) | reviewer workload |
| **Average precision (AP)** | area under the unit-level precision–recall curve | threshold-free comparison of ranking quality |
| **Look-alikes alerted** | share of look-alike units that were alerted | does the method fall for plausible normal events? |

Recall is also broken down by category, subtype and difficulty band.

### 8.2 Reading `REPORT.md`

| Section | Contents |
|---|---|
| §1 | headline numbers for the combiner |
| §2 | the four methods side by side. This is the core experimental result. |
| §3–4 | recall by anomaly type and by difficulty. Look here for weaknesses. |
| §5 | per unit kind: AP, precision and unit-level recall |
| §6 | the canonical A01–A10, one row each, with every method's hit or miss, the first alert month and the evidence text; also the highest-scoring alerts that do not match any label |
| §7 | every missed test anomaly |
| §8 | the chosen hyper-parameters and thresholds |

The header records the seeds, dataset version, library versions and git SHA
the results came from.

Supporting files:

- `test_events.csv` — one row per test anomaly per method
- `showcase_alerts.csv` — every combiner alert on the showcase, with reasons
- `metrics.json` — every number in the report

---

## 9. Known limitations

1. **Synthetic regularity.** Phase-1 normal data is smoother than a real ledger:
   - one payment per opex account per month
   - 6% monthly revenue noise
   - stable invoice sizes
   - no payroll sub-ledger or direct-cost breakdown

   Detection is therefore easier than it will be on TSH's books. The scores
   are an upper bound. Phase-2 datagen realism, and above all a check on real
   data, are the next steps.
2. **Closed world.** The combiner learns the ten injected types. A new type
   of anomaly relies on the label-free methods (Isolation Forest, robust
   statistics, rules). That is one reason all four methods are kept and
   reported.
3. **Warm-up.** Year-on-year statistics need about 18 months of history. Two
   of the four missed sustained drops on the test seeds begin in the first
   half of 2022, before that history exists.
4. **Footprint matching is lenient.** Any alert inside the footprint counts,
   even one whose evidence is about something else. For example, A07's alert
   also mentions A02's lingering revenue shortfall. Alert precision, detection
   delay and the per-anomaly evidence in the report are there to keep this
   honest.
5. **No look-alike for cut-offs.** Every revenue journal without an invoice
   breaks reconciliation by construction, so `revenue_cutoff` is easy by
   design. On real data, legitimate accrued revenue would need its own
   treatment, for example a separate accrued-revenue account.
6. **Long anomalies are partly invisible.** The first months of an erosion
   ramp barely differ from baseline, but they are labelled positive. For this
   reason unit-level recall (§5 of the report) is lower than event-level
   recall.
7. **Duplicates** are detected only as exact amount matches within ±3 days on
   the same account and department.
8. **The review budget is an assumption** (5 alerts per company-month in
   total). It should be set with TSH's finance team.

---

## 10. Reproduce in three commands

```bash
cd ml-service && source venv/bin/activate      # deps: npm run setup, or pip install -r requirements-dev.txt
python -m training.anomaly.train               # ~80 s  -> models/anomaly/v1/model.joblib + meta.json
python -m training.anomaly.evaluate            # ~16 s  -> models/anomaly/v1/REPORT.md (+ metrics.json, CSVs)
```

`--quick` (3 train, 2 validation and 2 test seeds) gives a smoke run in about
35 s. `pytest` runs the whole suite, including that smoke run. Use
`pytest -m "not slow"` to skip it.

---

## 11. From model to dashboard

The trained model runs in production as a batch job, not per request. Code:
`app/anomaly/score.py`.

1. **Trigger.** A run starts after every `python -m datagen --load`, from a
   scheduled `python -m app.anomaly.score`, or from `POST /anomalies/rescore`.
   A Postgres advisory lock allows one run at a time; a second request gets 409.
2. **Read.** The ledger is streamed from Postgres
   (`loaders.from_postgres`). On the canonical dataset this gives exactly the
   same 57 alerts, scores and reasons as the in-memory data used in §8.
3. **Closed months only.** Months up to the end of last month (Singapore time)
   are scored. A month still in progress has partial totals that look like a
   sudden revenue drop, so it is left out until it ends. This is the same
   causal rule as §5: a month is judged only on data up to its own end.
4. **Store.** The alerts replace the contents of `anomaly_alert` in one
   transaction, and the run is recorded in `anomaly_run`. An alert that is
   raised again keeps its `first_flagged_at`, so the web app can notify about
   each one once. If a run fails, the previous alerts stay in place.
5. **Read in the app.** The dashboard reads the two tables through Prisma
   (`web/app/dashboard/data/anomalies.ts`). It never loads the model.

A run on the canonical ledger takes about 4 s: 3 s to read 105k ledger lines
and 1–2 s to score.
