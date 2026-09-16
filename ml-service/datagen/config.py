"""Business-model configuration for the TSH Group synthetic dataset (Phase 1).

Every tunable number lives here. DATA_MODEL.md explains what each represents.
All monetary values are SGD. The company shape is a defensible assumption for
TSH Group (heavy lift / crane / engineering services, Singapore) — see
DATA_MODEL.md "Assumptions".
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

PHASE = 1
CURRENCY = "SGD"

# --- Run window -----------------------------------------------------------
START = date(2021, 1, 1)
AS_OF = date(2026, 8, 31)          # "today" in the app; last day generated
OPENING_DATE = date(2021, 1, 1)    # opening balance sheet is posted on this day
DEFAULT_SEED = 20260901


def gst_rate(d: date) -> float:
    """Singapore GST: 7% through 2022, 8% in 2023, 9% from 2024."""
    if d >= date(2024, 1, 1):
        return 0.09
    if d >= date(2023, 1, 1):
        return 0.08
    return 0.07


# --- Business units -----------------------------------------------------
@dataclass(frozen=True)
class BU:
    code: str
    name: str
    rev_2021: float       # baseline annual revenue in FY2021
    growth: float         # compound annual growth rate
    gross_margin: float   # baseline gross margin (revenue - direct cost) / revenue
    seasonality: str      # key into SEASONALITY
    avg_invoice: float     # mean sales-invoice value
    invoice_cv: float      # coefficient of variation of invoice value
    rev_code: str          # GL revenue account
    cogs_code: str         # GL direct-cost account


BUSINESS_UNITS = [
    BU("CR", "Crane Rental",           15_000_000,  0.08, 0.34, "strong",  25_000, 0.70, "4100", "5100"),
    BU("HL", "Heavy Lift & Haulage",    9_000_000,  0.10, 0.22, "lumpy",  120_000, 1.10, "4200", "5200"),
    BU("EN", "Engineering Services",    6_500_000,  0.06, 0.40, "mild",    40_000, 0.60, "4300", "5300"),
    BU("TP", "Transport & Logistics",   5_000_000,  0.07, 0.18, "mild",     8_000, 0.55, "4400", "5400"),
    BU("FA", "Fabrication & Steel",     3_500_000,  0.04, 0.25, "mild",    30_000, 0.70, "4500", "5500"),
    BU("TR", "Equipment Trading",       3_200_000, -0.06, 0.12, "flat",    55_000, 0.90, "4600", "5600"),
    BU("MN", "Maintenance & Parts",     1_800_000,  0.12, 0.45, "flat",     4_000, 0.60, "4700", "5700"),
]

# Monthly revenue multipliers (Jan..Dec); re-normalised to mean 1.0 at runtime.
SEASONALITY = {
    "strong": [0.80, 0.78, 1.05, 1.08, 1.10, 1.12, 1.10, 1.07, 1.05, 1.05, 0.92, 0.88],
    "mild":   [0.92, 0.90, 1.02, 1.03, 1.04, 1.05, 1.04, 1.03, 1.02, 1.02, 0.97, 0.96],
    "lumpy":  [0.85, 0.80, 1.10, 1.05, 1.15, 1.20, 1.05, 1.10, 1.00, 1.05, 0.90, 0.75],
    "flat":   [1.0] * 12,
}
REVENUE_MONTHLY_NOISE = 0.06   # lognormal sigma on each BU-month revenue

# segment: "Machining" (bespoke fabrication/engineering/maintenance work) vs
# "Bulk" (rental, haulage, logistics, trading, corporate/unallocated).
DEPARTMENTS = [
    ("CR", "Crane Rental", "Bulk"),
    ("HL", "Heavy Lift & Haulage", "Bulk"),
    ("EN", "Engineering Services", "Machining"),
    ("TP", "Transport & Logistics", "Bulk"),
    ("FA", "Fabrication & Steel", "Machining"),
    ("TR", "Equipment Trading", "Bulk"),
    ("MN", "Maintenance & Parts", "Machining"),
    ("CP", "Corporate & Shared Services", "Bulk"),
    ("NA", "Unallocated", "Bulk"),
]

BRANCHES = [
    ("HQ", "TSH Group HQ (Tuas)"),
    ("JURONG", "Jurong Yard"),
    ("PENJURU", "Penjuru Depot"),
]

# --- Customers & receipts ---------------------------------------------
N_CUSTOMERS = 250
N_SALES_AGENTS = 12

# segment -> (share of customers, terms days, pay-lag mean, pay-lag sd)
# pay lag is measured in days relative to the invoice due date.
PAYMENT_SEGMENTS = {
    "prompt":       (0.38, 30, -3, 5),
    "normal":       (0.42, 30,  7, 8),
    "slow":         (0.16, 45, 20, 12),
    "chronic_late": (0.04, 60, 52, 18),
}
DSO_DRIFT_PER_MONTH = 0.12    # systemic slide in pay lag (days/month) — WC signal
PARTIAL_PAY_PROB = 0.04
SHORT_PAY_FRACTION = (0.80, 0.97)
# invoices older than this (days before AS_OF) are treated as collected unless
# the customer has stopped paying — keeps period-end AR realistic.
STALE_AR_DAYS = 200
N_OPENING_AR = 55            # opening receivables split into this many invoices

# --- Opening balance sheet (SGD, on OPENING_DATE) --------------------
# Positive = debit balance, negative = credit balance.
# 3900 Retained earnings is computed as the balancing figure.
OPENING = {
    "1010":  2_500_000,   # Bank
    "1200":  6_800_000,   # Trade receivables (== sum of opening AR invoice values)
    "1300":    900_000,   # Inventory
    "1400":    400_000,   # Prepayments
    "1510": 15_000_000,   # Plant & equipment - cranes (gross)
    "1511":  5_000_000,   # Plant & equipment - vehicles (gross)
    "1512":  2_000_000,   # Plant & equipment - other (gross)
    "1900": -9_500_000,   # Accumulated depreciation (contra-asset)
    "2100": -3_200_000,   # Trade payables
    "2200":   -800_000,   # Accruals
    "2310":   -250_000,   # GST output tax
    "2400": -1_800_000,   # Hire purchase creditors
    "2500": -5_000_000,   # Bank loan
    "3000": -5_000_000,   # Share capital
}

# --- Operating expenses (monthly SGD, FY2021 baseline) --------------
OPEX_2021_MONTHLY = {
    "6100": 250_000,   # Staff costs - operations support
    "6110": 110_000,   # Staff costs - management
    "6200":  45_000,   # Office rental
    "6210":  12_000,   # Utilities
    "6220":   8_000,   # Office & administration
    "6300":  18_000,   # Insurance
    "6500":   6_000,   # Professional fees
    "6510":   5_000,   # IT & software
    "6520":   3_000,   # Telecommunications
    "6600":   4_000,   # Marketing & entertainment
    "6700":   2_000,   # Bank charges
    "6800":  15_000,   # Motor vehicle expenses
    "6900":   3_000,   # Sundry expenses
}
OPEX_GROWTH = 0.05             # annual
OPEX_MONTHLY_NOISE = 0.05
SALARY_STEP_MONTH = 4          # April increment
DEC_BONUS_MULTIPLIER = 1.6     # December staff-cost multiplier (13th month + bonus)
AUDIT_MONTHS = (2, 3)          # professional-fee spike months
AUDIT_SPIKE = 35_000

DEPRECIATION_2021_MONTHLY = 183_000
DEPRECIATION_BU_SPLIT = {"CR": 0.42, "HL": 0.24, "TP": 0.14, "FA": 0.08, "CP": 0.12}

CAPEX_EVENT = {
    "date": date(2024, 5, 15),
    "asset_code": "1510",
    "amount": 2_500_000,
    "cash_portion": 1_000_000,   # remainder financed via hire purchase (2400)
    "extra_monthly_depreciation": 21_000,
}

LOAN_REPAY_QUARTERLY = 150_000
LOAN_INTEREST_ANNUAL = 0.045

# --- Budget ----------------------------------------------------------
# One "OPERATING BUDGET" scenario per fiscal year. Budget for year Y is set from
# year (Y-1) actuals smoothed and lifted; FY2021 budget is lifted from its own
# baseline. Budgets are deliberately smooth (no month noise).
BUDGET_REVENUE_UPLIFT = 1.08
BUDGET_EXPENSE_UPLIFT = 1.04
