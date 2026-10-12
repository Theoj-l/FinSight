"""Evaluate the forecasters on the held-out test window, once.

    python -m training.forecast.evaluate            # test seeds 41-50 + the showcase dataset
    python -m training.forecast.evaluate --quick    # 2 test seeds (smoke test)

Compared on the test window (2025-09 .. 2026-08): every baseline, the tuned
Holt-Winters and the tuned Prophet (settings chosen by train.py on the
validation window), and the selected production model.

Writes next to config.json:
    REPORT.md        the results (METHODOLOGY.md §8 explains how to read it)
    metrics.json     every number in the report
    comparison.csv   test rows, alongside the validation rows written by train.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import pandas as pd

from app.forecast import engine as E
from app.forecast import metrics as M
from app.forecast.model import ForecastModel

from . import bench, compare
from . import candidates as C
from .train import DEFAULT_OUT, TARGETS

H_SHOWN = (1, 3, 6, 12)
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _pct(x, digits: int = 1) -> str:
    return "–" if x is None or x != x else f"{x:.{digits}f}%"


def _k(x) -> str:
    return "–" if x is None or x != x else f"S${x / 1000:,.0f}k"


def test_candidates(model: ForecastModel) -> list[tuple[str, str, dict[str, E.Spec]]]:
    """(family, label, specs) for every model compared on the test window."""
    out = [(c.family, c.label, C.specs(c.spec, c.spec)) for c in C.BASELINES]
    for fam in ("holt_winters", "prophet"):
        best = model.meta["family_best"].get(fam)
        if best:
            s = C.spec_from_dict(best["spec"])
            out.append((fam, best["candidate"], C.specs(s, s)))
    return out


def company_h1(fc: pd.DataFrame) -> pd.DataFrame:
    co = E.to_company(fc.drop(columns=["family"], errors="ignore"))
    return co[co["horizon"] == 1]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="training.forecast.evaluate")
    ap.add_argument("--model", default=DEFAULT_OUT)
    ap.add_argument("--jobs", type=int, default=-1)
    ap.add_argument("--quick", action="store_true", help="2 test seeds (smoke test)")
    args = ap.parse_args(argv)
    mdir = os.path.abspath(args.model)
    model = ForecastModel.load(mdir)
    meta = model.meta
    selected = meta["selected"]["candidate"]
    test_seeds = list(bench.TEST_SEEDS[:2] if args.quick else bench.TEST_SEEDS)
    show = bench.SHOWCASE_SEED
    target = float(meta.get("target_mape", M.TARGET_MAPE))
    t0 = time.time()

    print(f"· series: {len(test_seeds)} test seeds + showcase {show} ({bench.MODE}), "
          f"stress test ({bench.STRESS_MODE})")
    series = bench.series_many(test_seeds + [show], jobs=args.jobs)
    stress_series = bench.series_many(test_seeds, mode=bench.STRESS_MODE, jobs=args.jobs)

    cands = test_candidates(model)
    sel_specs = model.specs
    print(f"· test-window backtest of {len(cands)} models; selected = {selected}")
    tasks = [(dict(seed=s, family=f, candidate=lbl), series[s], sp)
             for f, lbl, sp in sorted(cands, key=lambda c: c[0] != "prophet") for s in [*test_seeds, show]]
    fc = bench.backtest_many(tasks, "test", jobs=args.jobs)
    snaive = C.specs(E.Spec("snaive"), E.Spec("snaive"))
    stress = bench.backtest_many(
        [(dict(seed=s, family=f, candidate=lbl), stress_series[s], sp)
         for f, lbl, sp in [("selected", selected, sel_specs), ("baseline", "snaive", snaive)]
         for s in test_seeds], "test", jobs=args.jobs)
    direct = bench.backtest_many([(dict(seed=s), series[s], sel_specs) for s in test_seeds], "test",
                                 jobs=args.jobs, company_only=True)

    test = fc[fc["seed"].isin(test_seeds)]
    showcase = fc[fc["seed"] == show]
    sel_test = test[test["candidate"] == selected]
    sel_show = showcase[showcase["candidate"] == selected]

    # -- comparison.csv rows ------------------------------------------------
    cmp = [compare.rows(d[d["candidate"] == lbl], family=f, candidate=lbl, split="test", data=bench.MODE)
           for f, lbl, _ in cands for d in (test, showcase)]
    cmp += [compare.rows(stress[stress["candidate"] == lbl], family=f, candidate=lbl, split="test",
                         data=bench.STRESS_MODE, dept_level=False)
            for f, lbl in (("baseline", "snaive"), (meta["selected"]["family"], selected))]
    direct_rows = compare.rows(direct.assign(dept_no="ALL"), family=meta["selected"]["family"],
                               candidate=selected, split="test", data=bench.MODE, dept_level=False)
    cmp.append(direct_rows.assign(level="company_direct"))
    cmp_df = pd.concat(cmp, ignore_index=True)
    compare.write(mdir, cmp_df, replace_split="test")

    # -- headline: US3.5 target check -----------------------------------------
    def check(d: pd.DataFrame) -> dict:
        s = M.score_frame(company_h1(d), ["metric"]).set_index("metric")
        return {t: {**{k: (None if pd.isna(v) else float(v)) for k, v in s.loc[t].items()},
                    "meets_target": M.meets_target(s.loc[t, "mape"], target)} for t in TARGETS}

    headline = check(sel_test)
    headline_show = check(sel_show)
    passed = all(headline[t]["meets_target"] for t in TARGETS)

    per_seed = M.score_frame(company_h1(sel_test), ["seed", "metric"])
    spread = {t: {stat: float(g["mape"].agg(stat)) for stat in ("min", "median", "max")}
              for t, g in per_seed.groupby("metric")}

    # -- model comparison, horizons, fixed origin ------------------------------
    co = E.to_company(test.drop(columns=["family"]))
    h1 = M.score_frame(co[co["horizon"] == 1], ["candidate", "metric"])
    mae_snaive = h1[h1["candidate"] == "snaive"].set_index("metric")["mae"]
    h1["skill_vs_snaive"] = [1 - r.mae / mae_snaive[r.metric] for r in h1.itertuples()]
    horizons = M.score_frame(co[co["horizon"].isin(H_SHOWN)], ["candidate", "metric", "horizon"])
    first_origin = bench.origins("test")[0]
    fixed = M.score_frame(co[co["origin"] == first_origin], ["candidate", "metric"])

    # -- the selected model in detail -----------------------------------------
    sel_h1 = sel_test[sel_test["horizon"] == 1]
    depts = M.score_frame(sel_h1, ["dept_no", "metric"])
    prof = company_h1(sel_test)
    prof = prof[prof["metric"] == "profit"].assign(month=lambda d: d["period_no"] % 100)
    prof["ape"] = (prof["actual"] - prof["yhat"]).abs() / prof["actual"].abs() * 100
    by_month = prof.groupby("month").agg(mape=("ape", "mean"), actual=("actual", "mean")).reset_index()
    def h1_mape(d: pd.DataFrame) -> dict:
        return M.score_frame(d, ["metric"]).set_index("metric")["mape"].to_dict()

    bu_vs_direct = {"bottom_up": h1_mape(company_h1(sel_test)),
                    "direct": h1_mape(direct[direct["horizon"] == 1])}
    stress_h1 = M.score_frame(company_h1(stress), ["candidate", "metric"])

    labels = {lbl: (f, lbl) for f, lbl, _ in cands}
    metrics = dict(
        model_version=meta["model_version"], selected=selected, target_mape=target,
        test_seeds=test_seeds, showcase_seed=show, window=bench.WINDOWS["test"], passed=passed,
        headline=headline, headline_showcase=headline_show, per_seed_spread=spread,
        comparison_h1=h1.to_dict("records"), horizons=horizons.to_dict("records"),
        fixed_origin=dict(origin=first_origin, rows=fixed.to_dict("records")),
        departments_h1=depts.to_dict("records"), profit_by_month=by_month.to_dict("records"),
        bottom_up_vs_direct=bu_vs_direct, stress=stress_h1.to_dict("records"),
        seconds=round(time.time() - t0, 1),
    )
    with open(os.path.join(mdir, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2, default=float)
        f.write("\n")
    with open(os.path.join(mdir, "REPORT.md"), "w") as f:
        f.write(report(meta, metrics, h1, horizons, fixed, depts, by_month, stress_h1, labels))

    for t in TARGETS:
        r = headline[t]
        print(f"  test {t:7s} MAPE {r['mape']:5.2f}%  WAPE {r['wape']:5.2f}%  "
              f"{'meets' if r['meets_target'] else 'MISSES'} the {target:.0f}% target")
    print(f"\nwrote REPORT.md, metrics.json, comparison.csv -> {mdir}  ({time.time() - t0:.0f}s)")
    return 0


def report(meta, m, h1, horizons, fixed, depts, by_month, stress, labels) -> str:
    sel = m["selected"]
    target = m["target_mape"]
    seeds = compare.seeds_label(m["test_seeds"])
    fam_label = C.FAMILY_LABEL
    order = list(labels)

    def name(lbl: str) -> str:
        f, _ = labels.get(lbl, ("", lbl))
        star = " **(selected)**" if lbl == sel else ""
        return f"{fam_label.get(f, f)}: `{lbl}`{star}"

    L = [f"# Forecast model {meta['model_version']} — test report", "",
         f"Selected model: `{sel}` (family {fam_label[meta['selected']['family']]}), "
         f"chosen on the validation window {bench.WINDOWS['validation']} over seeds "
         f"{compare.seeds_label(meta['benchmark']['seeds']['validation'])}.",
         f"Test window {m['window'][0]}–{m['window'][1]}, rolling origin, test seeds {seeds} "
         f"({bench.MODE} mode) and the showcase dataset (seed {m['showcase_seed']}, the data in Supabase).",
         f"Trained {meta['created_at']} at git `{meta['git_sha']}`. "
         "How to read this report: `training/forecast/METHODOLOGY.md` §8.", ""]

    L += ["## 1. Target check (US3.5): 1-month-ahead MAPE ≤ "
          f"{target:.0f}%, company level", "",
          "| Target | MAPE (test seeds) | WAPE | MAE | RMSE | Seed range (MAPE) | Showcase MAPE | ≤ "
          f"{target:.0f}%? |", "|---|--:|--:|--:|--:|--:|--:|:-:|"]
    for t in TARGETS:
        r, s, sp = m["headline"][t], m["headline_showcase"][t], m["per_seed_spread"][t]
        L.append(f"| {t} | {_pct(r['mape'])} | {_pct(r['wape'])} | {_k(r['mae'])} | {_k(r['rmse'])} | "
                 f"{_pct(sp['min'])} – {_pct(sp['max'])} | {_pct(s['mape'])} | "
                 f"{'yes' if r['meets_target'] else '**no**'} |")
    misses = [t for t in TARGETS if not m["headline"][t]["meets_target"]]
    if not misses:
        verdict = "All three targets meet the threshold on the test seeds."
    else:
        detail = "; ".join(f"{t} {_pct(m['headline'][t]['mape'], 2)} on the test seeds, "
                           f"{_pct(m['headline_showcase'][t]['mape'], 2)} on the showcase dataset"
                           for t in misses)
        verdict = (f"**Not every target meets the threshold:** {detail}. Per US3.5 this limitation must be "
                   "disclosed in the UI (the forecast view shows each selection's live backtest accuracy and "
                   "band) and to the sponsor. §6 shows where the profit error comes from.")
    L += ["", verdict, ""]

    L += ["## 2. Model comparison (US3.2, US3.3): 1-month-ahead, company level, test seeds", "",
          "Skill = 1 − MAE / MAE of the seasonal naive. Positive means better than the seasonal naive.", "",
          "| Model | Revenue MAPE | Cost MAPE | Profit MAPE | Profit WAPE "
          "| Revenue skill | Cost skill | Profit skill |",
          "|---|--:|--:|--:|--:|--:|--:|--:|"]
    t1 = h1.set_index(["candidate", "metric"])
    for lbl in order:
        g = lambda met, col, lbl=lbl: t1.loc[(lbl, met), col]  # noqa: E731
        L.append(f"| {name(lbl)} | {_pct(g('revenue', 'mape'))} | {_pct(g('cost', 'mape'))} | "
                 f"{_pct(g('profit', 'mape'))} | {_pct(g('profit', 'wape'))} | "
                 + " | ".join(f"{g(t, 'skill_vs_snaive'):+.0%}" for t in TARGETS) + " |")
    L.append("")

    L += ["## 3. Error by horizon (US3.3: longer-term trends), MAPE, test seeds", "",
          "Targets after the test window are not scored, so longer horizons have fewer forecasts.", ""]
    hz = horizons.set_index(["candidate", "metric", "horizon"])
    for t in TARGETS:
        L += [f"**{t}**", "", "| Model | " + " | ".join(f"h={h}" for h in H_SHOWN) + " |",
              "|---|" + "--:|" * len(H_SHOWN)]
        for lbl in order:
            L.append(f"| {name(lbl)} | " + " | ".join(
                _pct(hz["mape"].get((lbl, t, h))) for h in H_SHOWN) + " |")
        n = [int(hz["n"].get((order[0], t, h), 0)) for h in H_SHOWN]
        L += ["| *forecasts scored* | " + " | ".join(map(str, n)) + " |", ""]

    L += [f"## 4. Fixed origin: fitted on months up to {m['fixed_origin']['origin']} only", "",
          "Each model is fitted once at the end of the validation year and forecasts the whole test year "
          "(h = 1–12) without seeing any test month. This is the strict reading of \"trained on the "
          "training split only\".", "",
          "| Model | Revenue MAPE | Cost MAPE | Profit MAPE |", "|---|--:|--:|--:|"]
    fx = fixed.set_index(["candidate", "metric"])["mape"]
    for lbl in order:
        L.append(f"| {name(lbl)} | " + " | ".join(_pct(fx.get((lbl, t))) for t in TARGETS) + " |")
    L.append("")

    L += ["## 5. Selected model by business unit, 1-month-ahead, test seeds", "",
          "All overhead sits in `CP`, so business-unit profit is gross profit and CP profit is negative "
          "(MAPE is still defined against |actual|). A unit whose profit is close to zero, such as `TR` "
          "(trading margin eroding to about 1% in the canonical anomaly A10), gets a huge MAPE from small "
          "S$ errors; read its WAPE instead.", "",
          "| Dept | Revenue MAPE | Cost MAPE | Profit MAPE | Profit WAPE |", "|---|--:|--:|--:|--:|"]
    d = depts.set_index(["dept_no", "metric"])
    for dept in sorted(depts["dept_no"].unique()):
        L.append(f"| {dept} | " + " | ".join(_pct(d["mape"].get((dept, t))) for t in TARGETS)
                 + f" | {_pct(d['wape'].get((dept, 'profit')))} |")
    L.append("")

    L += ["## 6. Where the profit error comes from: 1-month-ahead profit APE by calendar month", "",
          "Profit is a small difference of two large numbers, so a month with low profit turns a "
          "normal-sized S$ error into a large percentage. December carries the 13th-month payroll, "
          "so its profit is the lowest.", "",
          "| Month | Mean APE | Mean actual profit |", "|---|--:|--:|"]
    for r in by_month.itertuples():
        L.append(f"| {MONTHS[int(r.month) - 1]} | {_pct(r.mape)} | {_k(r.actual)} |")
    L.append("")

    bd = m["bottom_up_vs_direct"]
    L += ["## 7. Bottom-up vs a direct company-level model (selected method, 1-month-ahead MAPE)", "",
          "Stored forecasts are per department and summed (bottom-up), so any filter adds up. This checks "
          "what that costs against forecasting the company total directly. The two are almost equal "
          "because an additive model is close to linear in its input: the sum of the departments' fits "
          "is nearly the fit of the sum.", "",
          "| | Revenue | Cost | Profit |", "|---|--:|--:|--:|",
          "| Bottom-up (production) | " + " | ".join(_pct(bd["bottom_up"].get(t), 2) for t in TARGETS) + " |",
          "| Direct company total | " + " | ".join(_pct(bd["direct"].get(t), 2) for t in TARGETS) + " |", ""]

    st = stress.set_index(["candidate", "metric"])["mape"]
    L += [f"## 8. Stress test: {bench.STRESS_MODE}-mode ledgers (≈3× the anomaly rate), test seeds", "",
          "The same seeds generated with the anomaly benchmark's dense random anomalies (one-off spikes, "
          "margin collapses, sustained drops). It shows how the forecast degrades on a much noisier "
          "ledger.", "",
          "| Model | Revenue MAPE | Cost MAPE | Profit MAPE |", "|---|--:|--:|--:|"]
    for lbl in ("snaive", sel):
        L.append(f"| {name(lbl)} | " + " | ".join(_pct(st.get((lbl, t))) for t in TARGETS) + " |")
    L.append("")

    L += ["## 9. Validation (how the model was chosen)", "",
          meta["selection_rule"][0].upper() + meta["selection_rule"][1:] + ".", "",
          "| Candidate | Revenue | Cost | Profit | Worst |", "|---|--:|--:|--:|--:|"]
    for lbl, v in meta["validation_company_h1_mape"].items():
        star = " **(selected)**" if lbl == sel else ""
        L.append(f"| `{lbl}`{star} | " + " | ".join(_pct(v[t]) for t in TARGETS)
                 + f" | {_pct(max(v.values()))} |")
    L.append("")
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())
