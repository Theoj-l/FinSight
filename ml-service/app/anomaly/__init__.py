"""FinSight anomaly detection — shared by offline training and (next phase) serving.

Pipeline (see training/anomaly/METHODOLOGY.md for the full method):

    Books (loaders)  ->  features (causal, scale-free)  ->  detectors / model  ->  alerts

An *alert unit* is what an accountant reviews in one month:

    dept  a business unit in a month            ("HL, Jul 2023")
    acc   a Corporate (CP) expense account      ("6800, Mar 2025")
    cust  a customer's receivables position     ("C0122, Nov 2024")

Every feature for month t uses only data dated on or before the end of month t,
with baselines drawn from months before t, so the same code scores a live
ledger month by month.
"""
