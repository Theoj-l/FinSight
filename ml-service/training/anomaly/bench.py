"""The benchmark: which seeds are used for what, and how a seed becomes features.

Split by seed (never by row): every seed is a complete, independent 68-month
company history with its own randomly placed anomalies, so no information
about a test company can leak into training through shared months, customers
or baselines.
"""
from __future__ import annotations

from dataclasses import dataclass

from joblib import Parallel, delayed

from app.anomaly import features as F
from app.anomaly import loaders
from datagen.config import DEFAULT_SEED
from datagen.pipeline import generate

TRAIN_SEEDS = tuple(range(1, 31))     # fit detectors and combiners
VAL_SEEDS = tuple(range(31, 41))      # choose hyper-parameters and thresholds
TEST_SEEDS = tuple(range(41, 51))     # reported results — touched once, by evaluate.py
SHOWCASE_SEED = DEFAULT_SEED          # the canonical A01–A10 dataset loaded in Supabase


@dataclass
class SeedData:
    seed: int
    mode: str
    fs: F.FeatureSet
    log: list[dict]
    decoys: list[dict]


def featurize(seed: int, mode: str = "random", journal_model=None) -> SeedData:
    tables = generate(seed, anomalies=mode)
    fs = F.build(loaders.from_tables(tables))
    if journal_model is not None:
        fs = F.attach_journal_scores(fs, journal_model)
    return SeedData(seed=seed, mode=mode, fs=fs, log=tables["_anomaly_log"],
                    decoys=tables["_decoy_log"])


def featurize_many(seeds, mode: str = "random", journal_model=None, jobs: int = -1) -> list[SeedData]:
    return list(Parallel(n_jobs=jobs)(delayed(featurize)(s, mode, journal_model) for s in seeds))
