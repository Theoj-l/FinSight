"""Outputs: CSV files and a bulk load into Postgres (public 17 tables +
the separate `datagen` schema for labels / run metadata)."""
from __future__ import annotations

import json
import os

import pandas as pd

_HERE = os.path.dirname(__file__)
_META_SQL = os.path.join(_HERE, "sql", "datagen_meta.sql")

COLUMNS = {
    "acc_type": ["acc_type", "description", "is_bs_type"],
    "dept": ["dept_no", "description", "segment"],
    "branch": ["branch_code", "branch_name", "is_active"],
    "sales_agent": ["sales_agent", "description", "is_active"],
    "fiscal_year": ["fiscal_year_name", "from_date", "to_date", "is_active"],
    "gl_mast": ["acc_no", "parent_acc_no", "description", "acc_type"],
    "pl_format": ["seq", "row_type", "acc_type", "description", "credit_as_positive"],
    "debtor": ["acc_no", "company_name", "sales_agent", "credit_limit", "display_term"],
    "item_group": ["item_group", "description", "sales_code", "purchase_code"],
    "item": ["item_code", "description", "item_group", "is_active"],
    "budget": ["budget_key", "budget_name"],
    "gl_dtl": ["gl_dtl_key", "gl_trx_id", "acc_no", "dept_no", "trans_date",
              "description", "journal_type", "source_type", "ref_no1",
              "home_dr", "home_cr"],
    "pbalance": ["period_no", "acc_no", "dept_no", "home_dr", "home_cr"],
    "budget_pbalance": ["budget_key", "period_no", "acc_no", "dept_no", "amount"],
    "iv": ["doc_key", "doc_no", "debtor_code", "doc_date", "sales_agent",
           "branch_code", "description", "local_ex_tax", "local_net_total",
           "local_total_cost", "cancelled"],
    "iv_dtl": ["dtl_key", "doc_key", "seq", "item_code", "description", "dept_no",
               "qty", "unit_price", "local_sub_total", "local_total_cost"],
    "ar_invoice": ["doc_key", "doc_no", "debtor_code", "doc_date", "due_date",
                   "description", "sales_agent", "branch_code", "local_net_total",
                   "local_payment_amt", "outstanding", "cancelled"],
}
LOAD_ORDER = list(COLUMNS)

ANOMALY_COLS = ["anomaly_id", "category", "subtype", "severity", "period_start",
                "period_end", "affected_table", "affected_dept", "affected_account",
                "affected_customer", "baseline_amount", "actual_amount",
                "deviation_pct", "description", "detection_hint"]


DECOY_COLS = ["decoy_id", "kind", "trans_date", "period_no", "acc_no", "dept_no",
              "amount", "description"]


def write_csvs(tables: dict, anomaly_log: list, seed: int, out: str) -> None:
    os.makedirs(out, exist_ok=True)
    for tbl, cols in COLUMNS.items():
        pd.DataFrame(tables[tbl], columns=cols).to_csv(
            os.path.join(out, f"{tbl}.csv"), index=False)
    pd.DataFrame(anomaly_log, columns=ANOMALY_COLS).to_csv(
        os.path.join(out, "datagen_anomaly_log.csv"), index=False)
    decoy_path = os.path.join(out, "decoy_log.csv")
    if tables.get("_decoy_log"):
        # benign look-alikes (random mode only) — for false-positive analysis;
        # never loaded to Postgres
        pd.DataFrame(tables["_decoy_log"], columns=DECOY_COLS).to_csv(decoy_path, index=False)
    elif os.path.exists(decoy_path):
        os.remove(decoy_path)   # stale file from an earlier random run


def load_postgres(tables: dict, anomaly_log: list, run_meta: dict, db_url: str) -> None:
    import psycopg

    with open(_META_SQL) as f:
        meta_sql = f.read()

    with psycopg.connect(db_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(meta_sql)
            cur.execute("truncate " + ", ".join(LOAD_ORDER) +
                        " restart identity cascade")
            cur.execute("truncate datagen.anomaly_log")
            for tbl in LOAD_ORDER:
                cols = COLUMNS[tbl]
                rows = tables[tbl]
                with cur.copy(f'copy {tbl} ({", ".join(cols)}) from stdin') as cp:
                    for r in rows:
                        cp.write_row([r.get(c) for c in cols])
            with cur.copy(
                f'copy datagen.anomaly_log ({", ".join(ANOMALY_COLS)}) from stdin'
            ) as cp:
                for r in anomaly_log:
                    cp.write_row([r.get(c) for c in ANOMALY_COLS])
            cur.execute(
                "insert into datagen.run (seed, phase, from_period, to_period, "
                "row_counts, notes) values (%s, %s, %s, %s, %s, %s)",
                (run_meta["seed"], run_meta["phase"], run_meta["from_period"],
                 run_meta["to_period"], json.dumps(run_meta["row_counts"]),
                 run_meta["notes"]),
            )
        conn.commit()
