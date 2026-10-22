# FinSight synthetic dataset — data model & interpretation guide

This describes the dataset produced by `python -m datagen` and loaded into
Supabase. It is **synthetic** but internally consistent: it behaves like a real
AutoCount extract for TSH Group, a Singapore heavy-lift / crane / engineering
services group.

- **Currency:** SGD. All `local_*` / `home_*` columns are already in SGD.
- **Window:** 2021-01-01 → 2026-08-31 (`AS_OF`). "Today" in the app is 2026-09.
- **Grain:** transactions are daily-dated; `pbalance` / `budget_pbalance` are monthly.
- **Determinism:** everything is seeded (`--seed`, default `20260901`). Same seed
  and anomaly mode → identical dataset.
- **Version:** dataset **v1.1** (see §10 for what changed from v1.0). It is
  recorded in `datagen.run.notes` and `SUMMARY.md`.

The 17 ledger tables live in the **`public`** schema (introspected by Prisma).
Anomaly labels and run metadata live in a separate **`datagen`** schema that
Prisma does not touch.

---

## 1. How to run

```bash
cd ml-service
source venv/bin/activate      # deps are installed by `npm run setup`

python -m datagen                                # canonical showcase: generate + validate + write CSVs
python -m datagen --load                         # ... then load into Postgres
python -m datagen --anomalies random --seed 7    # a benchmark dataset (random anomalies, §6.2)
```

`--anomalies canonical` (default) injects the ten fixed anomalies A01–A10. This
is the dataset loaded into Supabase. `--anomalies random` injects 23–40
anomalies at random places, which is how the anomaly model's training and test
data is built (see `training/anomaly/METHODOLOGY.md`). Both modes also post
unlabelled look-alikes (§6.3).

Outputs (git-ignored) land in `datagen/output/`:

| File | What |
|------|------|
| `*.csv` | one per table, exactly the loaded rows |
| `datagen_anomaly_log.csv` | the anomaly labels |
| `decoy_log.csv` | unlabelled look-alikes (§6.3); CSV only, never loaded |
| `VALIDATION.txt` | every consistency check + result |
| `SUMMARY.md` | P&L, revenue/margin by BU, AR aging, cash, anomaly list |

`--load` connects with `DATABASE_URL` (session pooler, port 5432). The CLI
reads it from `ml-service/.env`; a value already set in the shell takes
priority. It then **truncates** the 17 tables and `datagen.anomaly_log` and
bulk-`COPY`s the new data. It aborts if any hard validation check fails.

---

## 2. The TSH Group business model (assumptions)

These are defensible assumptions, not sponsor-provided figures. All tunable in
`config.py`.

**Seven business units** (the `dept` dimension), FY2021 revenue baseline:

| dept | Business unit | Segment | ~FY2021 rev | Trend | Gross margin | Revenue account |
|------|---------------|---------|------------:|-------|-------------:|-----------------|
| `CR` | Crane Rental | Bulk | S$15.0M | +8%/yr | ~34% | 4100 |
| `HL` | Heavy Lift & Haulage | Bulk | S$9.0M | +10%/yr | ~22% (lumpy) | 4200 |
| `EN` | Engineering Services | Machining | S$6.5M | +6%/yr | ~40% | 4300 |
| `TP` | Transport & Logistics | Bulk | S$5.0M | +7%/yr | ~18% | 4400 |
| `FA` | Fabrication & Steel | Machining | S$3.5M | +4%/yr | ~25% | 4500 |
| `TR` | Equipment Trading | Bulk | S$3.2M | **−6%/yr** | ~12% | 4600 |
| `MN` | Maintenance & Parts | Machining | S$1.8M | +12%/yr | ~45% | 4700 |

Plus `CP` (Corporate & Shared Services — carries all overhead and balance-sheet
control accounts) and `NA` (Unallocated — sentinel, currently unused), both
segment `Bulk`.

`dept.segment` (`Machining` vs `Bulk`) is not an AutoCount field — it's a
FinSight-added grouping (2026-09-16) for business-segment reporting: bespoke,
labour-intensive work (fabrication, engineering, maintenance) vs
volume/logistics-driven work (rental, haulage, transport, trading) plus
corporate overhead.

**Group shape:** ~S$45M revenue in FY2021 rising to ~S$60M in FY2025; gross
margin ~29%; operating expenses ~S$9–10M/yr; profit before tax ~S$4–7M/yr
(~10–12% net margin). Three branches (`HQ` Tuas, `JURONG`, `PENJURU`). 250
customers, 12 sales agents, 39 service line-items across 7 item groups.

**Direct-cost model (Phase 1):** every sales invoice books `Dr direct cost /
Cr trade payables` for its cost of sales — i.e. all direct costs are treated as
incurred on credit from subcontractors/suppliers, roughly matched to revenue.
Splitting fuel / operator wages / equipment running costs out of this is Phase 2.

**Overhead:** all `6xxx` operating expenses are posted to dept `CP`, except
depreciation which is split across `CR/HL/TP/FA/CP`. So BU-level results are a
**gross-profit** view, not fully-absorbed net profit. Full absorption is Phase 2.

---

## 3. `period_no` convention

`period_no` (in `pbalance`, `budget_pbalance`) is an **integer `YYYYMM`**:
`202503` = March 2025. It sorts chronologically and needs no `fiscal_year` join.
Fiscal year = calendar year; `fiscal_year` maps `FYyyyy` to Jan 1 – Dec 31.

To get a period from a transaction date: `date.year * 100 + date.month`.

---

## 4. Table-by-table

### GL & reporting

| Table | Grain | Notes |
|-------|-------|-------|
| `acc_type` | 1 row / type | 9 types. `is_bs_type = false` → P&L (`RE`, `CS`, `EX`, `OI`). |
| `gl_mast` | 1 row / account | 54 accounts, 8 header + 46 detail. `parent_acc_no` self-join for the hierarchy; `acc_type` drives every roll-up. |
| `pl_format` | 1 row / statement line | AutoCount-style P&L layout keyed by `acc_type`. `row_type`: `H` heading, `A` account block, `S` subtotal. `credit_as_positive` = show credit balances as positive (revenue). |
| `gl_dtl` | 1 row / posting line | ~105k lines. Every `gl_trx_id` is a balanced journal (Σ`home_dr` = Σ`home_cr`). `journal_type` → `source_type` is always OPENING→O, SALES→I, RECEIPT→R, PAYMENT→P, GENERAL→J. `ref_no1` = source doc no (invoice no on SALES and RECEIPT lines; `LOAN`, `GST`, `CAPEX`, `OPEN` markers; else empty). `gl_trx_id` and `gl_dtl_key` follow `trans_date` order. |
| `pbalance` | period × account × dept | **Derived** by aggregating `gl_dtl`. `home_dr` / `home_cr` are that month's movements (not cumulative). The opening balance sheet lands in period `202101`. |
| `fiscal_year` | 1 row / year | FY2021–FY2026, `is_active` on FY2026. |
| `budget` | 1 row / scenario | One `BUDGET FYyyyy` per year; `budget_key` = the year. |
| `budget_pbalance` | budget × period × account × dept | Budget = prior-year actual per (account, dept), lifted (+8% revenue / +4% cost) and spread **evenly** across 12 months. Stored on the **debit-positive** basis: `amount ≈ home_dr − home_cr`. Variance = `(pbalance.home_dr − pbalance.home_cr) − budget_pbalance.amount`. Only P&L accounts are budgeted. |

### Accounts receivable

| Table | Grain | Notes |
|-------|-------|-------|
| `debtor` | 1 row / customer | 250. `display_term` is free text (`"30 DAYS"` …). Payment-behaviour segment is **not** stored — it only shapes the receipts. |
| `ar_invoice` | 1 row / invoice | ~14.8k. `local_net_total` includes GST. `local_payment_amt` and `outstanding` are **derived** from the modelled receipts; `outstanding = local_net_total − local_payment_amt`. `cancelled` is always false in Phase 1. Aging is computable from this table alone (`due_date` vs a reference date). Opening receivables are prefixed `OB…`. |

### Sales

| Table | Grain | Notes |
|-------|-------|-------|
| `iv` | 1 row / sales invoice | ~14.8k. `doc_no` = `IV{YYYYMM}{nnnn}`, unique (one counter per month across all BUs). `local_ex_tax` = revenue before GST (**ties to GL revenue** for the same dept-month, except the injected cut-off error). `local_net_total` = incl GST. `local_total_cost` = header COGS. No `local_total` column (AutoCount quirk preserved). |
| `iv_dtl` | 1 row / invoice line | ~37k. Σ`local_sub_total` per `doc_key` = `iv.local_ex_tax`; Σ`local_total_cost` = `iv.local_total_cost`. `dept_no` = the business unit. |
| `item`, `item_group` | masters | `item_group.sales_code` / `purchase_code` are the GL revenue / cost accounts the group posts to — the reconciliation link back to `gl_dtl`. |

### Reference

`dept` (9), `branch` (3), `sales_agent` (12 — last one inactive).

### `datagen` schema (labels — not AutoCount)

| Table | Notes |
|-------|-------|
| `datagen.anomaly_log` | One row per injected anomaly. See §6. |
| `datagen.run` | One row describing the generation run (seed, window, row counts). Replaced on every `--load`. |

`drop schema datagen cascade;` removes all of it; regenerate with `--load`.

---

## 5. Patterns embedded in the "clean" data

The base dataset (ignoring anomalies) already contains learnable structure:

- **Trend** — each BU compounds at its own rate; `TR` shrinks.
- **Seasonality** — monthly revenue multipliers per BU (Singapore pattern: Jan–Feb
  CNY dip, mid-year peak, December slowdown). `HL` is deliberately lumpy.
- **GST** — output GST at the correct Singapore rate by date (7% ≤2022, 8% 2023,
  9% ≥2024), booked to `2310`, remitted quarterly to bank.
- **Payroll** — steps up with an April increment each year and a ~1.6× December
  month (13th month + bonus).
- **Working-capital drift** — customer payment lag creeps up ~0.12 day/month
  (rising DSO), on top of per-customer segment behaviour (prompt / normal / slow /
  chronic-late).
- **Capex** — one crane purchase (May 2024, S$2.5M, part hire-purchase) that
  steps up depreciation.
- **Weekly pattern** — invoices are dated on weekdays only.

---

## 6. The anomalies (`datagen.anomaly_log`)

The 17 ledger tables contain **no** flag. The label, location and size of each
anomaly live only in `datagen.anomaly_log`. Injected journals follow the same
bookkeeping conventions as normal postings of their kind: journal type, source
type, reference and narrative all match (§10). The only way to find an anomaly
is therefore its accounting content.

### 6.1 Canonical anomalies (the Supabase dataset)

| id | category | what | where / when | how to detect |
|----|----------|------|--------------|---------------|
| A01 | revenue | one-off project, revenue ≈ 2.6× trend | `HL` / 2023-07 | monthly revenue outlier for dept HL |
| A02 | revenue | lost key client, revenue −32% for 6 months | `EN` / 2024-03…08 | sustained negative level shift |
| A03 | margin | cost overrun, gross margin 34% → 10% | `CR` / 2022-09 | `5100/4100` ratio spikes for one month |
| A04 | expense | office rental paid twice (S$52.4k × 2) | `6200` / 2023-11-26 | two identical `Dr 6200 / Cr 1010` "Expense 6200" journals, same day & amount; 6200 doubles |
| A05 | expense | S$208k one-off repair (~12× normal) | `6800` / 2025-03-19 | account 6800 monthly total outlier; second payment in the month |
| A06 | posting_error | Transport cost booked to dept `FA` | `5400`+`FA` / 2024-06-25 | "Direct cost accrual" on an account FA never uses; FA margin drops |
| A07 | posting_error | S$185k revenue in GL with no invoice | `4300`+`EN` / 2024-12-28 | GL revenue > Σ`iv_dtl.local_sub_total` for that dept-month |
| A08 | posting_error | exact S$100,000.00 accrual journal | `6900` / 2022-12-30 | round-number amount, far larger than normal accrual adjustments, period end |
| A09 | receivables | a customer stops paying | customer `C0122` / from 2024-09 | invoices falling due go unpaid; no receipts; 90+ aging |
| A10 | margin | trading margin erodes 12% → 1% | `TR` / 2024-01…2025-12 | slow negative **trend** (not a single-month spike) |

`anomaly_log` columns: `anomaly_id, category, subtype, severity, period_start,
period_end, affected_table, affected_dept, affected_account, affected_customer,
baseline_amount, actual_amount, deviation_pct, description, detection_hint`.
`baseline_amount` is the noise-free expected value (trend × seasonality) for
that month.

To score a detector, join your alerts to `anomaly_log` on
`period_no ∈ [period_start, period_end]` and the matching
`dept_no` / `acc_no` / `debtor_code`.

### 6.2 Random mode (the ML benchmark)

`--anomalies random` builds each of the ten anomaly types as a template with
parameters for location, timing and size. Each seed gets 2–5 instances of most
templates, for 23–40 anomalies in total. Placement rules:

- anomalies start in 2022-01 or later
- no two anomalies share a dept-month, account-month or customer (±1-month buffer)
- IDs are `R001…`

Sizes run from easy to hard, and each anomaly records a difficulty band. The
choices come from their own random stream, `default_rng([seed, 1])`, so the
same seed has the same customers in both modes. The full catalogue is in
`training/anomaly/METHODOLOGY.md` §3.

### 6.3 Look-alikes (both modes)

Normal business events that resemble anomalies are posted deliberately
**unlabelled**, 3–8 of each kind:

- a second, smaller payment to an opex account
- a "Direct cost accrual" in the correct department
- small round-figure deposits
- small round-figure month-end accruals

They never touch a labelled cell. They are listed in `decoy_log.csv` (CSV only,
not loaded) so that false positives on them can be measured.

---

## 7. Consistency guarantees (always true)

Checked by `validate.py` on every run (`VALIDATION.txt`):

1. Every `gl_trx_id` balances; global Σ debits = Σ credits; each period's trial
   balance nets to zero.
2. Σ`iv_dtl.local_sub_total` = `iv.local_ex_tax`; Σ`iv_dtl.local_total_cost` =
   `iv.local_total_cost` (per invoice).
3. `ar_invoice.outstanding` = `local_net_total − local_payment_amt`.
4. Σ`ar_invoice.outstanding` = GL trade receivables (`1200`) **minus** the
   unbilled revenue cut-off accruals (A07 in canonical mode). The amounts come
   from the anomaly plan, not from any marker in the ledger.
5. `pbalance` exactly reproduces the `gl_dtl` aggregation.
6. GL revenue = sales sub-ledger revenue for every dept-month **except exactly**
   the injected cut-off errors. This break is intentional and detectable.
7. `iv.doc_no` and `ar_invoice.doc_no` are unique. Receipts link to invoices
   through `gl_dtl.ref_no1 = doc_no`.
8. `gl_trx_id` follows `trans_date` order, `gl_dtl_key` follows `gl_trx_id`, and
   each journal has one date.
9. Leakage guards: every `journal_type`/`source_type` pair is conventional, and
   no `ref_no1` carries an anomaly marker.

---

## 8. Simplifications & Phase 2

Phase 1 deliberately leaves out:

- **Payroll sub-ledger** (`PayrollTransaction` etc.) — deferred; payroll cost is
  in `gl_dtl` as `6100/6110` only.
- **Direct-cost breakdown** — all COGS is `Dr 5xxx / Cr 2100`; no fuel / wages /
  equipment split, no inventory movement for Trading.
- **Overhead absorption** — overhead stays on `CP`; BU results are gross-profit
  only.
- **Input GST** — only output GST is modelled; quarterly remittance clears the
  full `2310` balance, so cash tax outflow is overstated (P&L unaffected).
- **Dividends / financing** — no dividends and only one capex event, so cash
  accumulates to ~S$40M by 2026. Realistic cash management is Phase 2.
- **Cancelled invoices, credit notes, multi-currency** — not generated.
- **Very regular "normal" data** — one payment per opex account per month and
  6% monthly revenue noise. This makes anomalies easier to find than in a real
  ledger. Phase 2 realism will make the benchmark harder.

---

## 9. Using the data for ML

**Forecasting** (revenue, expense, cash):
- Series: `pbalance` net movement by `(period_no, acc_no)` or `(period_no,
  dept_no)` for P&L; daily cash from `gl_dtl` filtered to account `1010`.
- ~68 monthly points per series — use classical / gradient-boosted models, and
  exploit the many parallel series. Daily cash gives ~1,400 points.
- Natural holdout: last 6–8 months. Anomaly months (A01, A02, A05) are useful
  hard cases — decide whether to mask them in training.

**Anomaly detection:** this is built. See `training/anomaly/METHODOLOGY.md` for
the method and `models/anomaly/v1/REPORT.md` for the results. In short:

- Training and test data come from **random-mode seeds** (§6.2): train 1–30,
  validation 31–40, test 41–50.
- The canonical dataset (§6.1) is a showcase that is never trained on.
- Features come from `pbalance`, `gl_dtl`, `iv_dtl` and a month-by-month
  rebuild of receivables. **Do not use `ar_invoice.outstanding` or
  `local_payment_amt` as features for past months.** They are snapshots at
  `AS_OF`, so using them leaks the future.
- A10-type anomalies need a **trend** test, not a point-outlier test.

**AR / collections risk:**
- Per-invoice features: customer, amount, terms, month, prior payment history for
  that customer, current DSO trend.
- Label options: "paid > 30 days late" (from receipt timing — reconstructable
  from `gl_dtl` RECEIPT lines vs `ar_invoice.due_date`) or "still outstanding and
  90+ days at period end".

---

## 10. Changelog

### v1.1 (2026-09-23) — label-leakage fixes and the random benchmark

Before building the anomaly model, we audited v1.0 for ways an anomaly could
be found *without* reading its accounting content. The audit found four such
shortcuts, and the new tests found a fifth. All are fixed.
`training/anomaly/METHODOLOGY.md` §1.1 has the full table.

| Change | Why |
|---|---|
| Injected journals now use normal conventions: `PAYMENT/P "Expense 6800"`, `GENERAL/J "Month-end accrual adjustment"`, `"Direct cost accrual"`, `"Revenue accrual"`. They no longer carry `ANOM-*` / `DUP-AP` references or `PAYMENT/J` / `SALES/J` types. | The markers identified every anomaly by themselves |
| Injected journals are posted inside their own month, and `gl_trx_id` / `gl_dtl_key` are renumbered in date order | Anomalies used to hold the highest keys |
| A04 is a real duplicate of the Nov-2023 office-rental payment (`6200`), where it used to be an unmatched S$84.5k supplier payment | The old A04 had no original payment, so the label was false |
| Invoice `doc_no` has one counter per month across all BUs | 10,315 invoice numbers were duplicates, so receipts could not be linked to invoices |
| Both modes post unlabelled look-alikes (§6.3) | In v1.0 the narrative of A06 was unique to it |
| `--anomalies random` mode, `pipeline.generate()`, and the validation checks 7–9 in §7 | This is the benchmark for the anomaly model |
| The CLI reads `DATABASE_URL` from `ml-service/.env` | The README already said it did |

Unchanged: the business model and every seeded random draw of the base
simulation. Row counts, P&L totals and AR balances match v1.0 except for the
handful of injected and look-alike journals. The labels in §6.1 keep their
IDs, types, periods and departments; only A04's account (now `6200`) and its
date changed.

### v1.0 (2026-09-02) — Phase 1

This was the first dataset: 17 tables and 10 hand-placed anomalies.
