"""Reference and master data: chart of accounts, P&L layout, dimensions,
customers, items, agents, fiscal years."""
from __future__ import annotations

from datetime import date

import numpy as np

from . import config as C

# --- Account types -----------------------------------------------------
# (acc_type, description, is_bs_type)
ACC_TYPES = [
    ("CA", "Current Asset", True),
    ("NA", "Non-Current Asset", True),
    ("CL", "Current Liability", True),
    ("NL", "Non-Current Liability", True),
    ("EQ", "Equity", True),
    ("RE", "Revenue", False),
    ("CS", "Cost of Sales", False),
    ("EX", "Operating Expense", False),
    ("OI", "Other Income", False),
]

# --- Chart of accounts ----------------------------------------------
# (acc_no, description, acc_type, parent_acc_no)
SHARE_CAPITAL = "3000"
RETAINED_EARNINGS = "3900"

# (acc_no, description, acc_type, parent_acc_no)
ACCOUNTS = [
    ("1000", "Current Assets", "CA", None),
    ("1600", "Non-Current Assets", "NA", None),
    ("2000", "Current Liabilities", "CL", None),
    ("2600", "Non-Current Liabilities", "NL", None),
    ("3001", "Equity", "EQ", None),
    ("4000", "Revenue", "RE", None),
    ("5000", "Cost of Sales", "CS", None),
    ("6000", "Operating Expenses", "EX", None),
    ("1010", "Cash and Bank", "CA", "1000"),
    ("1200", "Trade Receivables", "CA", "1000"),
    ("1210", "Other Receivables and Deposits", "CA", "1000"),
    ("1300", "Inventory - Parts and Consumables", "CA", "1000"),
    ("1400", "Prepayments", "CA", "1000"),
    ("1510", "Plant and Equipment - Cranes", "NA", "1600"),
    ("1511", "Plant and Equipment - Vehicles", "NA", "1600"),
    ("1512", "Plant and Equipment - Other", "NA", "1600"),
    ("1900", "Accumulated Depreciation", "NA", "1600"),
    ("2100", "Trade Payables", "CL", "2000"),
    ("2200", "Accruals", "CL", "2000"),
    ("2310", "GST Output Tax", "CL", "2000"),
    ("2400", "Hire Purchase Creditors", "CL", "2000"),
    ("2500", "Bank Loan", "NL", "2600"),
    ("3000", "Share Capital", "EQ", "3001"),
    ("3900", "Retained Earnings", "EQ", "3001"),
    ("4100", "Crane Rental Revenue", "RE", "4000"),
    ("4200", "Heavy Lift and Haulage Revenue", "RE", "4000"),
    ("4300", "Engineering Services Revenue", "RE", "4000"),
    ("4400", "Transport and Logistics Revenue", "RE", "4000"),
    ("4500", "Fabrication Revenue", "RE", "4000"),
    ("4600", "Equipment Trading Revenue", "RE", "4000"),
    ("4700", "Maintenance and Parts Revenue", "RE", "4000"),
    ("4900", "Other Operating Income", "OI", "4000"),
    ("5100", "Crane Rental - Direct Costs", "CS", "5000"),
    ("5200", "Heavy Lift - Direct Costs", "CS", "5000"),
    ("5300", "Engineering - Direct Costs", "CS", "5000"),
    ("5400", "Transport - Direct Costs", "CS", "5000"),
    ("5500", "Fabrication - Direct Costs", "CS", "5000"),
    ("5600", "Equipment Trading - Cost of Goods Sold", "CS", "5000"),
    ("5700", "Maintenance - Direct Costs", "CS", "5000"),
    ("6100", "Staff Costs - Operations Support", "EX", "6000"),
    ("6110", "Staff Costs - Management", "EX", "6000"),
    ("6200", "Office Rental", "EX", "6000"),
    ("6210", "Utilities", "EX", "6000"),
    ("6220", "Office and Administration", "EX", "6000"),
    ("6300", "Insurance", "EX", "6000"),
    ("6400", "Depreciation", "EX", "6000"),
    ("6500", "Professional Fees", "EX", "6000"),
    ("6510", "IT and Software", "EX", "6000"),
    ("6520", "Telecommunications", "EX", "6000"),
    ("6600", "Marketing and Entertainment", "EX", "6000"),
    ("6700", "Bank Charges", "EX", "6000"),
    ("6710", "Interest Expense", "EX", "6000"),
    ("6800", "Motor Vehicle Expenses", "EX", "6000"),
    ("6900", "Sundry Expenses", "EX", "6000"),
]


def account_rows():
    seen = set()
    out = []
    for acc, desc, atype, parent in ACCOUNTS:
        if acc in seen:
            raise ValueError(f"duplicate account {acc}")
        seen.add(acc)
        out.append(dict(acc_no=acc, parent_acc_no=parent, description=desc, acc_type=atype))
    return out


def acc_type_rows():
    return [dict(acc_type=a, description=d, is_bs_type=b) for (a, d, b) in ACC_TYPES]


# --- P&L statement layout (keyed by acc_type) ----------------------
def pl_format_rows():
    # row_type: H heading, A account block, S subtotal
    rows = [
        (10, "H", None, "Revenue", True),
        (20, "A", "RE", "Operating Revenue", True),
        (30, "A", "OI", "Other Operating Income", True),
        (40, "S", None, "Total Revenue", True),
        (50, "H", None, "Cost of Sales", False),
        (60, "A", "CS", "Cost of Sales", False),
        (70, "S", None, "Gross Profit", True),
        (80, "H", None, "Operating Expenses", False),
        (90, "A", "EX", "Operating Expenses", False),
        (100, "S", None, "Total Operating Expenses", False),
        (110, "S", None, "Profit Before Tax", True),
    ]
    return [
        dict(seq=s, row_type=rt, acc_type=at, description=d, credit_as_positive=c)
        for (s, rt, at, d, c) in rows
    ]


def dept_rows():
    return [dict(dept_no=c, description=d) for (c, d) in C.DEPARTMENTS]


def branch_rows():
    return [dict(branch_code=c, branch_name=n, is_active=True) for (c, n) in C.BRANCHES]


def fiscal_year_rows():
    out = []
    for y in range(C.START.year, C.AS_OF.year + 1):
        out.append(dict(
            fiscal_year_name=f"FY{y}",
            from_date=date(y, 1, 1),
            to_date=date(y, 12, 31),
            is_active=(y == C.AS_OF.year),
        ))
    return out


# --- Names --------------------------------------------------------
_FIRST = ["Wei Ming", "Jun Jie", "Siti", "Kumar", "Hui Ling", "Ahmad", "Raj",
          "Mei Chen", "Farid", "Priya", "Zhi Hao", "Nurul", "Daniel", "Grace",
          "Bala", "Xin Yi", "Hafiz", "Kai Xuan", "Sara", "Ivan"]
_LAST = ["Tan", "Lim", "Lee", "Ng", "Wong", "Goh", "Chua", "Rahman", "Kaur",
         "Nair", "Ong", "Teo", "Koh", "Sim", "Yeo", "Chan", "Low", "Ho"]
_CO_PREFIX = ["Sin", "Asia", "Pan", "Union", "Global", "Prime", "Allied", "Marina",
              "Keppel", "Jurong", "Sembawang", "Changi", "Tuas", "Delta", "Summit",
              "Oriental", "Meridian", "Vanguard", "Straits", "Harbour"]
_CO_MID = ["Construction", "Engineering", "Marine", "Offshore", "Builders",
           "Infrastructure", "Industries", "Contractors", "Piling", "Steel",
           "Resources", "Logistics", "Development", "Civil", "Projects"]
_CO_SUFFIX = ["Pte Ltd", "Pte Ltd", "Pte Ltd", "(S) Pte Ltd", "Group Pte Ltd",
              "Holdings Pte Ltd", "Corporation Pte Ltd"]


def _person(rng):
    return f"{rng.choice(_FIRST)} {rng.choice(_LAST)}"


def _company(rng, used):
    for _ in range(50):
        name = f"{rng.choice(_CO_PREFIX)} {rng.choice(_CO_MID)} {rng.choice(_CO_SUFFIX)}"
        if name not in used:
            used.add(name)
            return name
    return name


def sales_agent_rows(rng):
    out = []
    for i in range(C.N_SALES_AGENTS):
        out.append(dict(sales_agent=f"SA{i + 1:02d}", description=_person(rng),
                        is_active=(i < C.N_SALES_AGENTS - 1)))  # last one inactive
    return out


_SEGMENTS = list(C.PAYMENT_SEGMENTS.items())
_TERMS_TEXT = {14: "14 DAYS", 30: "30 DAYS", 45: "45 DAYS", 60: "60 DAYS"}


def debtor_rows(rng, agent_codes):
    """Returns (rows, meta) where meta[acc_no] carries generation-only attributes
    (segment, primary BU, terms days) that are NOT stored in the debtor table."""
    seg_names = [s[0] for s in _SEGMENTS]
    seg_weights = np.array([s[1][0] for s in _SEGMENTS])
    seg_weights = seg_weights / seg_weights.sum()

    bu_codes = [b.code for b in C.BUSINESS_UNITS]
    bu_weights = np.array([b.rev_2021 for b in C.BUSINESS_UNITS])
    bu_weights = bu_weights / bu_weights.sum()

    used_names: set[str] = set()
    rows, meta = [], {}
    for i in range(C.N_CUSTOMERS):
        acc = f"C{i + 1:04d}"
        seg = rng.choice(seg_names, p=seg_weights)
        _, terms_days, lag_mean, lag_sd = C.PAYMENT_SEGMENTS[seg]
        # a few large customers get longer terms
        if rng.random() < 0.15:
            terms_days = 60
        primary_bu = rng.choice(bu_codes, p=bu_weights)
        credit_limit = float(round(rng.uniform(50_000, 900_000), -3))
        rows.append(dict(
            acc_no=acc,
            company_name=_company(rng, used_names),
            sales_agent=rng.choice(agent_codes),
            credit_limit=credit_limit,
            display_term=_TERMS_TEXT[terms_days],
        ))
        meta[acc] = dict(segment=seg, terms_days=terms_days,
                         lag_mean=lag_mean, lag_sd=lag_sd, primary_bu=primary_bu)
    return rows, meta


# --- Items & item groups -----------------------------------------
_ITEM_WORDS = {
    "CR": ["Mobile Crane 25T", "Mobile Crane 50T", "Crawler Crane 80T",
           "Tower Crane Month", "Operator Day Rate", "Rigging Crew Day",
           "Crane Mobilisation", "Standby Hour"],
    "HL": ["Heavy Lift Project", "SPMT Transport Day", "Gantry Lift Job",
           "Jacking and Skidding", "Transport Permit", "Escort Vehicle Day"],
    "EN": ["Lift Plan and Method Statement", "Structural Assessment",
           "Site Supervision Day", "Design Engineering Hour", "As-Built Package"],
    "TP": ["Prime Mover Trip", "Low Loader Trip", "Container Haulage",
           "Oversize Load Trip", "Warehousing Pallet Month"],
    "FA": ["Fabricated Steel Tonne", "Lifting Beam", "Spreader Bar",
           "Custom Frame", "Site Welding Day"],
    "TR": ["Used Crane Unit", "Slings and Shackles Set", "Wire Rope Reel",
           "Load Cell Unit", "Spare Parts Kit"],
    "MN": ["Annual Inspection", "Hydraulic Service", "Load Test",
           "Parts Replacement", "Breakdown Callout"],
}


def item_group_rows():
    out = []
    for b in C.BUSINESS_UNITS:
        out.append(dict(item_group=f"IG{b.code}", description=f"{b.name} Services",
                        sales_code=b.rev_code, purchase_code=b.cogs_code))
    return out


def item_rows():
    out = []
    for b in C.BUSINESS_UNITS:
        for j, word in enumerate(_ITEM_WORDS[b.code]):
            out.append(dict(item_code=f"{b.code}-{j + 1:02d}", description=word,
                            item_group=f"IG{b.code}", is_active=True))
    return out


def items_by_bu():
    m = {b.code: [] for b in C.BUSINESS_UNITS}
    for r in item_rows():
        m[r["item_code"].split("-")[0]].append(r["item_code"])
    return m
