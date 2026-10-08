"""Evaluate a trained model on the held-out test seeds and the canonical showcase.

    python -m training.anomaly.evaluate                  # models/anomaly/v1, test seeds 41–50
    python -m training.anomaly.evaluate --quick          # 2 test seeds (smoke test)

Writes next to the model:
    REPORT.md            human-readable results (METHODOLOGY.md §8 explains how to read it)
    metrics.json         every number in the report
    test_events.csv      one row per test anomaly per method: detected / delay
    showcase_alerts.csv  every combiner alert on the canonical dataset, with reasons
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import pandas as pd

from app.anomaly.model import METHODS, AnomalyModel
from app.anomaly.schema import KIND_LABEL, KINDS, REVIEW_BUDGET

from . import bench
from . import labels as LB
from . import metrics as M
from .train import DEFAULT_OUT

SUBTYPE_ORDER = ["one_off_spike", "sustained_drop", "cost_overrun", "gradual_erosion",
                 "duplicate_payment", "outlier_charge", "wrong_department", "revenue_cutoff",
                 "round_number_journal", "customer_delinquency"]
METHOD_LABEL = {"rules": "Rules only", "stat": "Robust statistics", "iforest": "Isolation Forest",
                "combiner": "**Combiner (GBM)**"}


def _pct(x) -> str:
    return "–" if x is None else f"{x:.0%}"


def _num(x, fmt=".2f") -> str:
    return "–" if x is None else format(x, fmt)


def score_seeds(model: AnomalyModel, seeds, mode: str, jobs: int):
    data = bench.featurize_many(seeds, mode=mode, journal_model=model.journal_iforest, jobs=jobs)
    scored = [model.score_units(LB.label_units(sd.fs.units, sd.log)) for sd in data]
    return data, scored


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="training.anomaly.evaluate")
    ap.add_argument("--model", default=DEFAULT_OUT)
    ap.add_argument("--jobs", type=int, default=-1)
    ap.add_argument("--quick", action="store_true", help="2 test seeds (smoke test)")
    args = ap.parse_args(argv)
    mdir = os.path.abspath(args.model)
    model = AnomalyModel.load(mdir)
    test_seeds = bench.TEST_SEEDS[:2] if args.quick else bench.TEST_SEEDS
    t0 = time.time()

    print(f"· score {len(test_seeds)} test seeds + showcase seed {bench.SHOWCASE_SEED}")
    test, test_scored = score_seeds(model, test_seeds, "random", args.jobs)
    show, show_scored = score_seeds(model, [bench.SHOWCASE_SEED], "canonical", 1)

    results = {m: M.evaluate(test, test_scored, m, model.thresholds[m]) for m in METHODS}
    showcase = {m: M.evaluate(show, show_scored, m, model.thresholds[m]) for m in METHODS}
    for m in METHODS:
        r = results[m]
        print(f"  test {m:9s} event recall {r['event_recall']:.3f}  "
              f"alert precision {r['alert_precision'] or 0:.3f}  alerts/month {r['alerts_per_month']:.2f}")

    # showcase alert list with reasons (combiner)
    show_alerts = model.alerts(show_scored[0], "combiner")
    units = pd.concat([show_scored[0][k] for k in KINDS])
    lab = dict(zip(zip(units["kind"], units["key"], units["period_no"], strict=True),
                   units["anomaly_id"], strict=True))
    show_alerts["anomaly_id"] = [lab.get((r.kind, r.key, r.period_no)) for r in show_alerts.itertuples()]
    show_alerts["reasons"] = show_alerts["reasons"].map(lambda xs: "; ".join(xs))
    show_alerts.to_csv(os.path.join(mdir, "showcase_alerts.csv"), index=False)

    ev = pd.concat([results[m]["_events"].assign(method=m) for m in METHODS], ignore_index=True)
    ev.to_csv(os.path.join(mdir, "test_events.csv"), index=False)

    strip = lambda d: {k: v for k, v in d.items() if not k.startswith("_")}  # noqa: E731
    out = dict(model=model.meta, test={m: strip(results[m]) for m in METHODS},
               showcase={m: strip(showcase[m]) for m in METHODS},
               evaluate_seconds=round(time.time() - t0, 1), quick=args.quick)
    with open(os.path.join(mdir, "metrics.json"), "w") as f:
        json.dump(out, f, indent=2, default=str)
    with open(os.path.join(mdir, "REPORT.md"), "w") as f:
        f.write(report(model, results, showcase, show_scored[0], show_alerts, args.quick))
    print(f"\nwrote REPORT.md, metrics.json, test_events.csv, showcase_alerts.csv -> {mdir}")
    return 0


def report(model: AnomalyModel, res: dict, show: dict, show_units, show_alerts: pd.DataFrame,
           quick: bool) -> str:
    meta = model.meta
    L: list[str] = []
    L.append(f"# FinSight anomaly model {meta['model_version']} — evaluation report\n")
    if quick or meta.get("quick"):
        L.append("> **Smoke-test run (`--quick`)** — too few seeds for the numbers to mean anything.\n")
    v = meta["versions"]
    s = meta["seeds"]
    L.append(f"- Trained {meta['created_at']} from git `{meta['git_sha']}` · dataset v{v['dataset']} · "
             f"Python {v['python']}, scikit-learn {v['sklearn']}, pandas {v['pandas']}, numpy {v['numpy']}")
    L.append(f"- Seeds: train {s['train'][0]}–{s['train'][-1]} ({len(s['train'])}), "
             f"validation {s['val'][0]}–{s['val'][-1]} ({len(s['val'])}), "
             f"**test {res['combiner']['seeds'][0]}–{res['combiner']['seeds'][-1]} "
             f"({len(res['combiner']['seeds'])})**, showcase `{s['showcase']}` (canonical A01–A10)")
    L.append("- Review budget (alerts per company-month, set on validation seeds): "
             + ", ".join(f"{KIND_LABEL[k]} {REVIEW_BUDGET[k]}" for k in KINDS))
    L.append(f"- Scored window: {M.SCORED_MONTHS} months per company (2022-01 → 2026-08); "
             "2021 is baseline history only")
    L.append("- Method and definitions: `training/anomaly/METHODOLOGY.md`. All data is synthetic.\n")

    c = res["combiner"]
    L.append("## 1. Headline (test seeds, combiner)\n")
    L.append(f"- **{_pct(c['event_recall'])} of {c['events']} anomalies detected** "
             f"(at least one alert inside the anomaly's footprint)")
    L.append(f"- {c['alerts_per_month']:.1f} alerts per company-month, of which {_pct(c['alert_precision'])} "
             "point at a labelled anomaly")
    L.append(f"- Unlabelled look-alikes alerted: {_pct(c['decoy_alert_rate'])}\n")

    L.append("## 2. Method comparison (test seeds)\n")
    L.append("Same features, same data, same review budget; only the scoring method differs. "
             "Average precision (AP) is threshold-free; the other columns are at the operating threshold.\n")
    L.append("| Method | Event recall | Alert precision | Alerts / month | AP business unit | "
             "AP expense acct | AP customer | Decoys alerted |")
    L.append("|---|--:|--:|--:|--:|--:|--:|--:|")
    for m in METHODS:
        r = res[m]
        pk = r["per_kind"]
        aps = " | ".join(_num(pk[k]["average_precision"], ".3f") for k in KINDS)
        L.append(f"| {METHOD_LABEL[m]} | {_pct(r['event_recall'])} | {_pct(r['alert_precision'])} | "
                 f"{r['alerts_per_month']:.2f} | {aps} | {_pct(r['decoy_alert_rate'])} |")
    L.append("\nRules only fire on hard accounting breaks, so they do not use the budget; the "
             "other methods are thresholded to it.\n")

    L.append("## 3. Recall by anomaly type (test seeds)\n")
    methods_hdr = " | ".join(METHOD_LABEL[m] for m in METHODS)
    L.append(f"| Anomaly type | n | {methods_hdr} | Median delay (combiner) |")
    L.append("|---|--:|" + "--:|" * len(METHODS) + "--:|")
    for sub in SUBTYPE_ORDER:
        cells = [res[m]["recall_by_subtype"].get(sub, {}) for m in METHODS]
        n = cells[-1].get("n", 0)
        delay = c["median_delay_by_subtype"].get(sub)
        L.append(f"| {sub} | {n} | " + " | ".join(_pct(x.get("recall")) for x in cells)
                 + f" | {_num(delay, '.1f')} mo |")
    L.append("")

    L.append("## 4. Recall by difficulty (test seeds)\n")
    L.append("Difficulty bands come from the injected magnitude (METHODOLOGY.md §3).\n")
    L.append("| Difficulty | n | " + " | ".join(METHOD_LABEL[m] for m in METHODS) + " |")
    L.append("|---|--:|" + "--:|" * len(METHODS))
    for band in ("easy", "medium", "hard"):
        cells = [res[m]["recall_by_difficulty"].get(band, {}) for m in METHODS]
        recalls = " | ".join(_pct(x.get("recall")) for x in cells)
        L.append(f"| {band} | {cells[-1].get('n', 0)} | {recalls} |")
    L.append("")

    L.append("## 5. Per business-unit / account / customer view (test seeds, combiner)\n")
    L.append("| Unit kind | Units | Positive units | AP | Alerts / month | Precision | Unit recall |")
    L.append("|---|--:|--:|--:|--:|--:|--:|")
    for k in KINDS:
        pk = c["per_kind"][k]
        L.append(f"| {KIND_LABEL[k]} | {pk['units']:,} | {pk['positives']:,} | "
                 f"{_num(pk['average_precision'], '.3f')} | {pk['alerts_per_month']:.2f} | "
                 f"{_pct(pk['precision'])} | {_pct(pk['unit_recall'])} |")
    L.append("")

    L.append(f"## 6. Showcase: canonical dataset (seed {s['showcase']}, A01–A10)\n")
    L.append("Never used for training, tuning or thresholds. One row per labelled anomaly.\n")
    sev = {m: show[m]["_events"].set_index("anomaly_id") for m in METHODS}
    L.append("| id | type | where | period | " + " | ".join(METHOD_LABEL[m] for m in METHODS)
             + " | first alert (combiner) | evidence |")
    L.append("|---|---|---|---|" + "---|" * len(METHODS) + "---|---|")
    for aid, e in sev["combiner"].iterrows():
        marks = ["✅" if sev[m].loc[aid, "detected"] else "❌" for m in METHODS]
        first = e["first_alert"]
        ev_txt = ""
        if pd.notna(first):
            hit = show_alerts[(show_alerts["anomaly_id"] == aid) & (show_alerts["period_no"] == int(first))]
            ev_txt = hit["reasons"].iloc[0] if len(hit) else ""
        per = f"{e['period_start']}" + (f"–{e['period_end']}" if e["period_end"] != e["period_start"] else "")
        where = f"{e['where']} / {e['account']}" if e["account"] else e["where"]
        first_txt = "–" if pd.isna(first) else f"{int(first)} (+{int(e['delay_months'])} mo)"
        L.append(f"| {aid} | {e['subtype']} | {where} | {per} | " + " | ".join(marks)
                 + f" | {first_txt} | {ev_txt or '–'} |")
    fp = show_alerts[show_alerts["anomaly_id"].isna()]
    sc = show["combiner"]
    L.append(f"\nCombiner on the showcase: {len(show_alerts)} alerts over {M.SCORED_MONTHS} months "
             f"({sc['alerts_per_month']:.2f} / month); {len(show_alerts) - len(fp)} inside a labelled "
             f"footprint, {len(fp)} elsewhere. Unlabelled look-alikes alerted: "
             f"{_pct(sc['decoy_alert_rate'])}. All alerts with reasons: `showcase_alerts.csv`.\n")
    if len(fp):
        L.append("Highest-scoring alerts outside any labelled anomaly (what a reviewer would also see):\n")
        L.append("| period | unit | score | evidence |")
        L.append("|---|---|--:|---|")
        for r in fp.sort_values("score", ascending=False).head(10).itertuples():
            L.append(f"| {r.period_no} | {KIND_LABEL[r.kind]} {r.key} | {r.score:.2f} | {r.reasons or '–'} |")
        L.append("")

    miss = c["_events"][~c["_events"]["detected"]]
    L.append(f"## 7. Missed test anomalies (combiner): {len(miss)} of {len(c['_events'])}\n")
    if len(miss):
        L.append("| seed | id | type | difficulty | where | period |")
        L.append("|---|---|---|---|---|---|")
        for r in miss.sort_values(["subtype", "difficulty"]).head(40).itertuples():
            per = f"{r.period_start}" + (f"–{r.period_end}" if r.period_end != r.period_start else "")
            L.append(f"| {r.seed} | {r.anomaly_id} | {r.subtype} | {r.difficulty} | {r.where} | {per} |")
        if len(miss) > 40:
            L.append(f"\n…and {len(miss) - 40} more in `test_events.csv`.")
        L.append("")

    L.append("## 8. Chosen settings\n")
    L.append("| Unit kind | Combiner (learning rate / trees / leaves) | Validation AP "
             "| Threshold (combiner) |")
    L.append("|---|---|--:|--:|")
    for k in KINDS:
        ch = meta["combiner_chosen"][k]
        best = max(meta["combiner_grid"][k], key=lambda r: r["val_average_precision"])
        L.append(f"| {KIND_LABEL[k]} | {ch['learning_rate']} / {ch['max_iter']} / {ch['max_leaf_nodes']} | "
                 f"{best['val_average_precision']:.3f} | {model.thresholds['combiner'][k]:.3f} |")
    L.append("")
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())
