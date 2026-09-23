"""One call from seed to a complete, validated-ready table dict.

Shared by the CLI (`python -m datagen`) and the anomaly-model training code
(`training/anomaly`), so both see byte-for-byte the same data for a given
(seed, anomalies) pair.

Seeding (see training/anomaly/METHODOLOGY.md §2):
  * `np.random.default_rng(seed)` drives masters (customers, agents) and the
    business simulation.
  * `np.random.default_rng([seed, 1])` drives *where / when / how big* random
    anomalies are, and where the unlabelled decoys go (both modes). Keeping it
    a separate stream means those choices never consume draws from the
    simulation stream, so the same seed always has the same customers and
    agents whether anomalies are canonical or random.
"""
from __future__ import annotations

import numpy as np

from . import config as C
from . import derive
from .anomalies import build_plan
from .engine import simulate
from .masters import build_masters

MASTER_TABLES = ["acc_type", "gl_mast", "pl_format", "dept", "branch",
                 "fiscal_year", "sales_agent", "debtor", "item_group", "item"]

ANOMALY_STREAM = 1   # spawn key for the anomaly RNG: default_rng([seed, ANOMALY_STREAM])


def generate(seed: int = C.DEFAULT_SEED, anomalies: str = "canonical") -> dict:
    """Returns the 17 tables (lists of row dicts) plus `_anomaly_log`,
    `_decoy_log` and `_meta`. Nothing is written anywhere."""
    rng = np.random.default_rng(seed)
    masters = build_masters(rng)
    arng = np.random.default_rng([seed, ANOMALY_STREAM])
    plan = build_plan(masters, mode=anomalies, rng=arng)
    tx = simulate(rng, masters, plan)

    tables: dict = {k: masters[k] for k in MASTER_TABLES}
    tables["gl_dtl"] = tx["gl_dtl"]
    tables["iv"] = tx["iv"]
    tables["iv_dtl"] = tx["iv_dtl"]
    tables["ar_invoice"] = tx["ar_invoice"]
    tables["pbalance"] = derive.pbalance_rows(tx["gl_dtl"])
    tables["budget"] = derive.budget_rows()
    tables["budget_pbalance"] = derive.budget_pbalance_rows(tables["pbalance"])
    tables["_anomaly_log"] = plan.log
    tables["_decoy_log"] = plan.decoys
    tables["_meta"] = dict(seed=seed, anomalies=anomalies, version=C.DATASET_VERSION,
                           phase=C.PHASE, unbilled_accruals=plan.unbilled_accruals())
    return tables
