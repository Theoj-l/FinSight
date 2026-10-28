"""Evaluate the forecasters on the held-out test window, once.

    python -m training.forecast.evaluate            # test seeds 51-60 + the showcase dataset
    python -m training.forecast.evaluate --quick    # 2 test seeds (smoke test)

Compared on the test window (2025-09 .. 2026-08): every baseline, the tuned
Holt-Winters and the tuned Prophet (settings chosen by train.py on the
validation window), and the selected production model. From v2 the models fit
with anomalous months masked, and two references show what that changed: the
v1 production model (no masking) on the same fresh test companies, and the
selected model on v1's test companies (41-50).

Writes next to config.json:
    REPORT.md        the results (METHODOLOGY.md §9 explains how to read it)
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


V1_MODEL = os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, "models", "forecast", "v1")
V1_FAMILY = "v1"


def test_candidates(model: ForecastModel) -> list[tuple[str, str, dict[str, E.Spec], bool]]:
    """(family, label, specs, masked) for every model compared on the test window."""
    masked = model.anomaly_mask
    out = [(c.family, c.label, C.specs(c.spec, c.spec), masked) for c in C.BASELINES]
    for fam in ("holt_winters", "prophet"):
        best = model.meta["family_best"].get(fam)
        if best:
            s = C.spec_from_dict(best["spec"])
            out.append((fam, best["candidate"], C.specs(s, s), masked))
    v1 = v1_model()
    if masked and v1 is not None:
        out.append((V1_FAMILY, v1_label(v1), v1.specs, False))
    return out


def v1_model() -> ForecastModel | None:
    try:
        return ForecastModel.load(os.path.abspath(V1_MODEL))
    except (FileNotFoundError, RuntimeError):
        return None


def v1_label(v1: ForecastModel) -> str:
    return f"v1 production model, no masking: {v1.meta['selected']['candidate']}"


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

    v1_seeds = list(bench.V1_TEST_SEEDS[:2] if args.quick else bench.V1_TEST_SEEDS)
    use_mask = model.anomaly_mask

    def mask(c: bench.Company):
        return c.mask if use_mask else None

    print(f"· series and anomaly masks: {len(test_seeds)} test seeds + showcase {show} ({bench.MODE}), "
          f"stress test ({bench.STRESS_MODE}), v1's test seeds")
    cos = bench.companies(test_seeds + [show], jobs=args.jobs)
    stress_cos = bench.companies(test_seeds, mode=bench.STRESS_MODE, jobs=args.jobs)
    v1_cos = bench.companies(v1_seeds, jobs=args.jobs) if use_mask else {}

    cands = test_candidates(model)
    sel_specs = model.specs
    print(f"· test-window backtest of {len(cands)} models; selected = {selected}")
    tasks = [(dict(seed=s, family=f, candidate=lbl), cos[s].pl, sp, cos[s].mask if m else None)
             for f, lbl, sp, m in sorted(cands, key=lambda c: c[0] not in ("prophet", V1_FAMILY))
             for s in [*test_seeds, show]]
    fc = bench.backtest_many(tasks, "test", jobs=args.jobs)
    snaive = C.specs(E.Spec("snaive"), E.Spec("snaive"))
    stress = bench.backtest_many(
        [(dict(seed=s, family=f, candidate=lbl), stress_cos[s].pl, sp, mask(stress_cos[s]))
         for f, lbl, sp in [("selected", selected, sel_specs), ("baseline", "snaive", snaive)]
         for s in test_seeds], "test", jobs=args.jobs)
    direct = bench.backtest_many([(dict(seed=s), cos[s].pl, sel_specs, mask(cos[s])) for s in test_seeds],
                                 "test", jobs=args.jobs, company_only=True)
    # v2 on the companies v1 was tested on, for a like-for-like comparison
    on_v1_seeds = bench.backtest_many(
        [(dict(seed=s), v1_cos[s].pl, sel_specs, v1_cos[s].mask) for s in v1_seeds], "test",
        jobs=args.jobs) if v1_cos else None

    test = fc[fc["seed"].isin(test_seeds)]
    showcase = fc[fc["seed"] == show]
    sel_test = test[test["candidate"] == selected]
    sel_show = showcase[showcase["candidate"] == selected]

    # -- comparison.csv rows ------------------------------------------------
    cmp = [compare.rows(d[d["candidate"] == lbl], family=f, candidate=lbl, split="test", data=bench.MODE)
           for f, lbl, _, _ in cands for d in (test, showcase)]
    cmp += [compare.rows(stress[stress["candidate"] == lbl], family=f, candidate=lbl, split="test",
                         data=bench.STRESS_MODE, dept_level=False)
            for f, lbl in (("baseline", "snaive"), (meta["selected"]["family"], selected))]
    direct_rows = compare.rows(direct.assign(dept_no="ALL"), family=meta["selected"]["family"],
                               candidate=selected, split="test", data=bench.MODE, dept_level=False)
    cmp.append(direct_rows.assign(level="company_direct"))
    if on_v1_seeds is not None:
        cmp.append(compare.rows(on_v1_seeds, family=meta["selected"]["family"], candidate=selected,
                                split="test", data=bench.MODE, dept_level=False))
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

    # -- what changed from v1 -------------------------------------------------------
    v1 = v1_model()
    versus_v1 = None
    if on_v1_seeds is not None and v1 is not None:
        v1_metrics = json.load(open(os.path.join(os.path.abspath(V1_MODEL), "metrics.json")))
        v1_row = test[test["candidate"] == v1_label(v1)]
        versus_v1 = {
            "v1_on_v1_seeds": {t: v1_metrics["headline"][t] for t in TARGETS},
            "v2_on_v1_seeds": check(on_v1_seeds),
            "v1_on_test_seeds": check(v1_row),
            "v2_on_test_seeds": headline,
            "v1_seeds": v1_seeds,
            "v1_published_seeds": v1_metrics["test_seeds"],
        }
    masked = {s: len(cos[s].mask) for s in [*test_seeds, show]} if use_mask else {}

    labels = {lbl: (f, lbl) for f, lbl, _, _ in cands}
    metrics = dict(
        model_version=meta["model_version"], selected=selected, target_mape=target,
        test_seeds=test_seeds, showcase_seed=show, window=bench.WINDOWS["test"], passed=passed,
        headline=headline, headline_showcase=headline_show, per_seed_spread=spread,
        comparison_h1=h1.to_dict("records"), horizons=horizons.to_dict("records"),
        fixed_origin=dict(origin=first_origin, rows=fixed.to_dict("records")),
        departments_h1=depts.to_dict("records"), profit_by_month=by_month.to_dict("records"),
        bottom_up_vs_direct=bu_vs_direct, stress=stress_h1.to_dict("records"),
        anomaly_mask=use_mask, masked_cells=masked, versus_v1=versus_v1,
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
        if f == V1_FAMILY:
            return f"*Reference:* `{lbl}`"
        return f"{fam_label.get(f, f)}: `{lbl}`{star}"

    L = [f"# Forecast model {meta['model_version']} — test report", "",
         f"Selected model: `{sel}` (family {fam_label[meta['selected']['family']]}), "
         f"chosen on the validation window {bench.WINDOWS['validation']} over seeds "
         f"{compare.seeds_label(meta['benchmark']['seeds']['validation'])}.",
         f"Test window {m['window'][0]}–{m['window'][1]}, rolling origin, test seeds {seeds} "
         f"({bench.MODE} mode) and the showcase dataset (seed {m['showcase_seed']}, the data in Supabase).",
         f"Trained {meta['created_at']} at git `{meta['git_sha']}`. "
         "How to read this report: `training/forecast/METHODOLOGY.md` §9.", ""]
    if m.get("anomaly_mask"):
        cells = m["masked_cells"]
        L += [f"Months the anomaly model flagged are left out of every fit "
              f"({sum(cells.values()) / len(cells):.0f} unit-month cells per company on average).", ""]

    vs = m.get("versus_v1")
    if vs:
        def row(label, d):
            return (f"| {label} | " + " | ".join(_pct(d[t]["mape"]) for t in TARGETS)
                    + f" | {_pct(d['profit']['wape'])} |")
        v1s = compare.seeds_label(vs["v1_seeds"])
        L += ["## 0. What changed from v1", "",
              "v2 leaves months flagged by the anomaly model out of every fit. v1's test companies had "
              f"already been seen before v2 was designed, so v2 is reported on fresh companies ({seeds}). "
              "1-month-ahead MAPE, company level:", "",
              "| | Revenue | Cost | Profit | Profit WAPE |", "|---|--:|--:|--:|--:|",
              row(f"v1, test companies {compare.seeds_label(vs['v1_published_seeds'])} (as published)",
                  vs["v1_on_v1_seeds"]),
              row(f"**v2**, test companies {v1s} (same companies as v1)", vs["v2_on_v1_seeds"]),
              row(f"v1 model, fresh test companies {seeds}", vs["v1_on_test_seeds"]),
              row(f"**v2, fresh test companies {seeds} (the reported result)**", vs["v2_on_test_seeds"]), ""]

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
    gap = bd["direct"]["profit"] - bd["bottom_up"]["profit"]
    if abs(gap) < 0.5:
        finding = "The two are almost equal, so summing departments costs nothing."
    elif gap > 0:
        why = (" With masking, a company-level model must drop a whole month whenever any unit is "
               "flagged, so it loses far more history than the unit models do.")
        finding = "Bottom-up is the more accurate of the two." + (why if m.get("anomaly_mask") else "")
    else:
        finding = "The direct model is more accurate here; bottom-up is kept so that every filter adds up."
    L += ["## 7. Bottom-up vs a direct company-level model (selected method, 1-month-ahead MAPE)", "",
          "Stored forecasts are per department and summed (bottom-up), so any filter adds up. This checks "
          "what that costs against forecasting the company total directly. " + finding, "",
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
          ("Every candidate was fitted with anomalous months masked. " if meta.get("anomaly_mask") else "")
          + meta["selection_rule"][0].upper() + meta["selection_rule"][1:] + ".", "",
          "| Candidate | Revenue | Cost | Profit | Worst |", "|---|--:|--:|--:|--:|"]
    for lbl, v in meta["validation_company_h1_mape"].items():
        star = " **(selected)**" if lbl == sel else ""
        L.append(f"| `{lbl}`{star} | " + " | ".join(_pct(v[t]) for t in TARGETS)
                 + f" | {_pct(max(v.values()))} |")
    L.append("")
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())
