"""Load the AutoCount tables the detectors need into typed DataFrames.

Sources: an in-memory `datagen.pipeline.generate()` result, a directory of
CSVs written by `python -m datagen`, or the live Postgres database.

Only ledger facts are loaded. `ar_invoice.outstanding` / `local_payment_amt`
are deliberately dropped: they are a snapshot at the extract date, so using
them for an earlier month would leak the future. Receivable positions are
rebuilt from invoices and GL receipts instead (features/receivables.py).
"""
from __future__ import annotations

import io
import os
from dataclasses import dataclass
from typing import TYPE_CHECKING

import pandas as pd

if TYPE_CHECKING:
    import psycopg

CODE_COLS = ["acc_no", "dept_no", "debtor_code", "doc_no", "ref_no1", "acc_type"]
PL_TYPES = ("RE", "OI", "CS", "EX")   # P&L account types (is_bs_type = false)

PG_QUERIES = {
    "gl_dtl": "select gl_trx_id, acc_no, dept_no, trans_date, journal_type, ref_no1, home_dr, home_cr "
              "from gl_dtl order by gl_dtl_key",
    "pbalance": "select period_no, acc_no, dept_no, home_dr, home_cr from pbalance "
                "order by period_no, acc_no, dept_no",
    "iv": "select doc_key, doc_no, doc_date, local_ex_tax from iv order by doc_key",
    "iv_dtl": "select doc_key, dept_no, local_sub_total from iv_dtl order by dtl_key",
    "ar_invoice": "select doc_no, debtor_code, doc_date, due_date, local_net_total from ar_invoice "
                  "order by doc_key",
    "gl_mast": "select acc_no, acc_type from gl_mast order by acc_no",
}


@dataclass
class Books:
    gl: pd.DataFrame          # gl_trx_id, acc_no, dept_no, trans_date, journal_type, ref_no1,
                              # home_dr, home_cr, period_no
    pbalance: pd.DataFrame    # period_no, acc_no, dept_no, home_dr, home_cr
    iv: pd.DataFrame          # doc_no, doc_date, local_ex_tax
    iv_dtl: pd.DataFrame      # doc_key, dept_no, local_sub_total (+ period_no via iv)
    ar: pd.DataFrame          # doc_no, debtor_code, doc_date, due_date, local_net_total
    acc_type: dict[str, str]  # acc_no -> acc_type
    first_period: int
    last_period: int


def _period(s: pd.Series) -> pd.Series:
    return (s.dt.year * 100 + s.dt.month).astype("int64")


def _frame(rows, cols=None) -> pd.DataFrame:
    df = rows.copy() if isinstance(rows, pd.DataFrame) else pd.DataFrame(rows)
    if cols is not None:
        df = df[cols]
    for c in CODE_COLS:
        if c in df.columns:
            df[c] = df[c].astype("string")
    return df


def _books(gl, pbalance, iv, iv_dtl, ar, gl_mast) -> Books:
    # ref_no1 is kept only as a join key (receipt -> invoice); it is never a
    # model feature (see schema.BANNED_COLUMNS).
    gl = _frame(gl, ["gl_trx_id", "acc_no", "dept_no", "trans_date", "journal_type",
                     "ref_no1", "home_dr", "home_cr"])
    if gl.empty:
        raise ValueError("gl_dtl is empty: there is no ledger to score")
    gl["trans_date"] = pd.to_datetime(gl["trans_date"])
    gl["period_no"] = _period(gl["trans_date"])

    pb = _frame(pbalance, ["period_no", "acc_no", "dept_no", "home_dr", "home_cr"])
    pb["period_no"] = pb["period_no"].astype("int64")

    iv = _frame(iv, ["doc_key", "doc_no", "doc_date", "local_ex_tax"])
    iv["doc_date"] = pd.to_datetime(iv["doc_date"])
    iv["period_no"] = _period(iv["doc_date"])

    ivd = _frame(iv_dtl, ["doc_key", "dept_no", "local_sub_total"])
    ivd = ivd.merge(iv[["doc_key", "period_no"]], on="doc_key", how="left")

    ar = _frame(ar, ["doc_no", "debtor_code", "doc_date", "due_date", "local_net_total"])
    ar["doc_date"] = pd.to_datetime(ar["doc_date"])
    ar["due_date"] = pd.to_datetime(ar["due_date"])

    mast = _frame(gl_mast, ["acc_no", "acc_type"])
    acc_type = dict(zip(mast["acc_no"], mast["acc_type"], strict=True))

    return Books(gl=gl, pbalance=pb, iv=iv, iv_dtl=ivd, ar=ar, acc_type=acc_type,
                 first_period=int(gl["period_no"].min()), last_period=int(gl["period_no"].max()))


def from_tables(tables: dict) -> Books:
    """From a `datagen.pipeline.generate()` result (lists of row dicts)."""
    gl = pd.DataFrame(tables["gl_dtl"])
    return _books(gl, tables["pbalance"], tables["iv"], tables["iv_dtl"],
                  tables["ar_invoice"], tables["gl_mast"])


def from_csv_dir(path: str) -> Books:
    """From a `python -m datagen` output directory."""
    def read(name: str) -> pd.DataFrame:
        return pd.read_csv(os.path.join(path, f"{name}.csv"), dtype={c: str for c in CODE_COLS})
    return _books(read("gl_dtl"), read("pbalance"), read("iv"), read("iv_dtl"),
                  read("ar_invoice"), read("gl_mast"))


def from_postgres(conn: psycopg.Connection) -> Books:
    """From the live database. Each table is streamed with COPY as CSV, so
    values are parsed exactly as in `from_csv_dir`."""
    def read(name: str) -> pd.DataFrame:
        buf = io.BytesIO()
        with conn.cursor().copy(f"copy ({PG_QUERIES[name]}) to stdout with (format csv, header)") as cp:
            for chunk in cp:
                buf.write(chunk)
        buf.seek(0)
        return pd.read_csv(buf, dtype={c: str for c in CODE_COLS})
    return _books(read("gl_dtl"), read("pbalance"), read("iv"), read("iv_dtl"),
                  read("ar_invoice"), read("gl_mast"))


def truncate(books: Books, period_no: int) -> Books:
    """The books as they stood at the end of `period_no` — used to prove the
    features are causal (tests) and to replay months one at a time."""
    gl = books.gl[books.gl["period_no"] <= period_no]
    iv = books.iv[books.iv["period_no"] <= period_no]
    ar = books.ar[_period(books.ar["doc_date"]) <= period_no]
    return Books(
        gl=gl.copy(), pbalance=books.pbalance[books.pbalance["period_no"] <= period_no].copy(),
        iv=iv.copy(), iv_dtl=books.iv_dtl[books.iv_dtl["period_no"] <= period_no].copy(),
        ar=ar.copy(), acc_type=books.acc_type, first_period=books.first_period,
        last_period=min(books.last_period, period_no))
