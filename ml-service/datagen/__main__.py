"""CLI: python -m datagen [--seed N] [--out DIR] [--load] [--db-url URL] [--yes]

Generates the dataset, validates it, writes CSVs + SUMMARY.md + VALIDATION.txt,
and (with --load) bulk-loads it into Postgres.
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np

from . import config as C
from . import derive, report, sinks, validate
from .anomalies import build_plan
from .engine import simulate
from .masters import build_masters

_MASTER_TABLES = ["acc_type", "gl_mast", "pl_format", "dept", "branch",
                  "fiscal_year", "sales_agent", "debtor", "item_group", "item"]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="datagen")
    ap.add_argument("--seed", type=int, default=C.DEFAULT_SEED)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "output"))
    ap.add_argument("--load", action="store_true",
                    help="load into Postgres after a clean validation")
    ap.add_argument("--db-url", default=os.environ.get("DATABASE_URL"))
    ap.add_argument("--yes", action="store_true", help="skip the load confirmation")
    args = ap.parse_args(argv)

    rng = np.random.default_rng(args.seed)
    print(f"seed={args.seed}  window={C.START}..{C.AS_OF}")
    print("· masters")
    masters = build_masters(rng)
    print("· anomaly plan")
    plan = build_plan(rng, masters)
    print("· simulate")
    tx = simulate(rng, masters, plan)

    tables: dict = {k: masters[k] for k in _MASTER_TABLES}
    tables["gl_dtl"] = tx["gl_dtl"]
    tables["iv"] = tx["iv"]
    tables["iv_dtl"] = tx["iv_dtl"]
    tables["ar_invoice"] = tx["ar_invoice"]
    print("· derive pbalance / budget")
    tables["pbalance"] = derive.pbalance_rows(tx["gl_dtl"])
    tables["budget"] = derive.budget_rows()
    tables["budget_pbalance"] = derive.budget_pbalance_rows(tables["pbalance"])
    tables["_anomaly_log"] = plan.log

    print("· validate")
    ok, lines = validate.run_checks(tables)
    text = "\n".join(lines)
    print(text)

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "VALIDATION.txt"), "w") as f:
        f.write(text + "\n")
    sinks.write_csvs(tables, plan.log, args.seed, args.out)
    with open(os.path.join(args.out, "SUMMARY.md"), "w") as f:
        f.write(report.summary(tables, args.seed))
    print(f"\nwrote CSVs + SUMMARY.md + VALIDATION.txt -> {args.out}")

    if not ok:
        print("\nHARD VALIDATION FAILED — not loading.")
        return 1

    if args.load:
        if not args.db_url:
            print("\n--load needs --db-url or DATABASE_URL")
            return 2
        target = args.db_url.split("@")[-1].split("/")[0]
        if not args.yes:
            resp = input(f"\nLoad into {target}?  This TRUNCATEs the 17 tables. [y/N] ")
            if resp.strip().lower() != "y":
                print("aborted")
                return 3
        run_meta = dict(
            seed=args.seed, phase=C.PHASE,
            from_period=C.START.year * 100 + C.START.month,
            to_period=C.AS_OF.year * 100 + C.AS_OF.month,
            row_counts={k: len(v) for k, v in tables.items() if isinstance(v, list)},
            notes=f"Phase {C.PHASE}",
        )
        print("· load")
        sinks.load_postgres(tables, plan.log, run_meta, args.db_url)
        print("loaded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
