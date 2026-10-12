"""Shared constants: alert-unit kinds, the feature allow-lists, the review budget.

The allow-lists are the *only* columns a model ever sees. Bookkeeping
artefacts that could identify injected rows (keys, references, narratives) are
banned outright and a test enforces it (tests/test_anomaly_allowlist.py).
"""
from __future__ import annotations

# Period helpers live in app/periods.py; re-exported for the anomaly code.
from app.periods import period_at as period_at
from app.periods import period_index as period_index
from app.periods import periods_between as periods_between

KINDS = ("dept", "acc", "cust")
KIND_LABEL = {"dept": "business unit", "acc": "expense account", "cust": "customer"}

# First month that is scored / trained on. The ledger starts 2021-01; the year
# before this gives every baseline at least 12 months of history.
FIRST_SCORED_PERIOD = 202201

# Average alerts per month an accountant is assumed to review, per unit kind.
# Thresholds are chosen on the validation seeds to hit these rates.
REVIEW_BUDGET = {"dept": 2.0, "acc": 1.5, "cust": 1.5}

BANNED_COLUMNS = {
    "gl_trx_id", "gl_dtl_key", "doc_key", "dtl_key", "ref_no1", "doc_no",
    "description", "journal_type", "source_type", "trans_date",
    "debtor_code", "acc_no", "dept_no", "key", "period_no", "anomaly_id", "y",
}

# --- journal-line features (input to the journal Isolation Forest) ----------
LINE_FEATURES = [
    "log_amt",          # log10(|amount| + 1)
    "log_ratio_cell",   # log10(amount / trailing-12m median line amount of its account-dept cell)
    "trailing_zeros",   # 0 if the amount has cents, else number of trailing zeros of whole dollars
    "month_end",        # posted in the last 3 days of the month
    "dom",              # day of month
    "jt_code",          # journal type as an ordinal (SALES 0, RECEIPT 1, PAYMENT 2, GENERAL 3)
    "n_lines",          # lines in the journal
    "pair_freq",        # share of prior months in which this account-dept cell was active
    "dup_count",        # other journals, same account/dept/amount, within +/-3 days (up to month end)
    "is_contra",        # posted against the account's natural side (e.g. Dr revenue)
]

# --- alert-unit features (input to the combiners / unit Isolation Forests) ---
DEPT_FEATURES = [
    "rev_z12", "rev_zyoy", "rev_level", "rev_cusum_neg", "rev_cusum_pos",
    "cost_z12", "cost_zyoy",
    "gm", "gm_dev12", "gm_z12", "gm_shift", "gm_mkz12", "gm_slope12", "gm_cusum_neg",
    "recon_gap", "new_pair_share", "min_pair_freq",
    "n_manual", "n_manual_dev", "manual_share", "max_line_ratio", "max_jscore",
]
ACC_FEATURES = [
    "z12", "zyoy", "log_ratio_med12", "cusum_pos",
    "n_journals", "n_journals_dev", "max_line_share", "max_line_ratio",
    "max_trailing_zeros", "round_month_end", "dup_max", "max_jscore",
]
CUST_FEATURES = [
    "log_outstanding", "overdue30_share", "overdue90_share", "wavg_dpd", "dpd_excess", "dpd_z",
    "n_open", "n_overdue30", "collect_ratio_90", "log_billed_90",
    "days_since_receipt", "gap_ratio", "out_growth_3m",
]
FEATURES = {"dept": DEPT_FEATURES, "acc": ACC_FEATURES, "cust": CUST_FEATURES}
