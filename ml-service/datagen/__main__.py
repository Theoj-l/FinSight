"""CLI: python -m datagen [--seed N] [--anomalies canonical|random] [--out DIR]
                         [--load] [--db-url URL] [--yes]

Generates the dataset, validates it, writes CSVs + SUMMARY.md + VALIDATION.txt,
and (with --load) bulk-loads it into Postgres.
"""
from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv

from . import config as C
from . import report, sinks, validate
from .pipeline import generate


def main(argv=None) -> int:
    # DATABASE_URL lives in ml-service/.env (see README); the shell env wins.
    load_dotenv(os.path.join(os.path.dirname(__file__), os.pardir, ".env"))
    ap = argparse.ArgumentParser(prog="datagen")
    ap.add_argument("--seed", type=int, default=C.DEFAULT_SEED)
    ap.add_argument("--anomalies", choices=["canonical", "random"], default="canonical",
                    help="canonical = the showcase A01–A10; random = benchmark injection")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "output"))
    ap.add_argument("--load", action="store_true",
                    help="load into Postgres after a clean validation")
    ap.add_argument("--db-url", default=os.environ.get("DATABASE_URL"))
    ap.add_argument("--yes", action="store_true", help="skip the load confirmation")
    args = ap.parse_args(argv)

    print(f"seed={args.seed}  anomalies={args.anomalies}  dataset v{C.DATASET_VERSION}  "
          f"window={C.START}..{C.AS_OF}")
    print("· generate")
    tables = generate(args.seed, args.anomalies)
    log = tables["_anomaly_log"]

    print("· validate")
    ok, lines = validate.run_checks(tables)
    text = "\n".join(lines)
    print(text)

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "VALIDATION.txt"), "w") as f:
        f.write(text + "\n")
    sinks.write_csvs(tables, log, args.seed, args.out)
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
            warn = "" if args.anomalies == "canonical" else \
                "  NOTE: this replaces the canonical showcase with a RANDOM benchmark seed."
            resp = input(f"\nLoad into {target}?  This TRUNCATEs the 17 tables.{warn} [y/N] ")
            if resp.strip().lower() != "y":
                print("aborted")
                return 3
        run_meta = dict(
            seed=args.seed, phase=C.PHASE,
            from_period=C.START.year * 100 + C.START.month,
            to_period=C.AS_OF.year * 100 + C.AS_OF.month,
            row_counts={k: len(v) for k, v in tables.items() if isinstance(v, list)},
            notes=f"Phase {C.PHASE} · dataset v{C.DATASET_VERSION} · anomalies={args.anomalies}",
        )
        print("· load")
        sinks.load_postgres(tables, log, run_meta, args.db_url)
        print("loaded.")
        rescore_anomalies(args.db_url)
        refresh_forecasts(args.db_url)
    return 0


def rescore_anomalies(db_url: str) -> None:
    """The ledger just changed, so refresh the stored anomaly alerts."""
    from app.anomaly import score
    from app.config import get_settings

    try:
        model = score.load_model(score.model_dir(get_settings()))
    except FileNotFoundError as e:
        print(f"· anomaly alerts NOT refreshed: {e}")
        return
    print("· score anomalies")
    s = score.run(db_url, model, triggered_by="datagen")
    print(f"  {s.n_alerts} alerts ({s.n_new} new), scored through {s.scored_through}, {s.seconds}s")


def refresh_forecasts(db_url: str) -> None:
    """The ledger just changed, so store a fresh forecast run."""
    from app.config import get_settings
    from app.forecast import run as forecast_run

    try:
        model = forecast_run.load_model(forecast_run.model_dir(get_settings()))
    except (FileNotFoundError, RuntimeError) as e:
        print(f"· forecasts NOT refreshed: {e}")
        return
    print("· forecast")
    s = forecast_run.run(db_url, model, triggered_by="datagen")
    print(f"  {s.n_forecast} forecast values after {s.history_through}, "
          f"{s.n_backtest} backtest, {s.seconds}s")


if __name__ == "__main__":
    sys.exit(main())
