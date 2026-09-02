"""Assembles reference + master data into one dict the engine consumes."""
from __future__ import annotations

from . import reference as R


def build_masters(rng) -> dict:
    agent_rows = R.sales_agent_rows(rng)
    agent_codes = [a["sales_agent"] for a in agent_rows]
    debtor_rows, debtor_meta = R.debtor_rows(rng, agent_codes)
    debtor_by_acc = {d["acc_no"]: d for d in debtor_rows}
    return dict(
        acc_type=R.acc_type_rows(),
        gl_mast=R.account_rows(),
        pl_format=R.pl_format_rows(),
        dept=R.dept_rows(),
        branch=R.branch_rows(),
        fiscal_year=R.fiscal_year_rows(),
        sales_agent=agent_rows,
        agent_codes=agent_codes,
        debtor=debtor_rows,
        debtor_by_acc=debtor_by_acc,
        debtor_meta=debtor_meta,
        item_group=R.item_group_rows(),
        item=R.item_rows(),
        items_by_bu=R.items_by_bu(),
    )
