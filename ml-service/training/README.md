# Training

Offline scripts and notebooks that build model artifacts. This code is **not**
shipped with the serving container.

Convention:

- One entry point per model, writing artifacts to `../models/<model>/<version>/`.
  The served version is committed (it ships in the Docker image), so commit a
  retrained model only when you mean to deploy it.
- Keep notebooks for exploration; move anything reproducible into a script.
- The serving layer (`app/`) only *loads* artifacts from `models/` — it never
  trains. Code that both training and serving need (features, detectors, the
  model bundle) lives in `app/`.

## Anomaly detection — `training/anomaly/`

How the model is trained and tested, including the seeding scheme, the
injected anomalies, the features and the metrics:
**[anomaly/METHODOLOGY.md](anomaly/METHODOLOGY.md)**.

```bash
cd ml-service && source venv/bin/activate
python -m training.anomaly.train        # ~80 s  -> models/anomaly/v1/model.joblib + meta.json
python -m training.anomaly.evaluate     # ~16 s  -> models/anomaly/v1/REPORT.md, metrics.json, CSVs
```

Add `--quick` to either command for a smoke run on a few seeds. Nothing here
connects to the database: every seed is generated in memory with
`datagen.pipeline.generate`.

| File | Role |
|------|------|
| `bench.py` | seed roles (train 1–30, validation 31–40, test 41–50, showcase `20260901`) and seed → features |
| `labels.py` | `anomaly_log` → labelled alert units; alerts → detected events and delays |
| `metrics.py` | threshold selection (best validation F1 within the review budget) and all metrics |
| `train.py` | fits the Isolation Forests and combiners, picks thresholds, saves the bundle |
| `evaluate.py` | scores the test seeds and the showcase, writes `REPORT.md` |

## Forecasting — `training/forecast/`

How the revenue / cost / profit forecaster is benchmarked and chosen (seeds,
time windows, rolling origin, candidates, selection rule, metrics):
**[forecast/METHODOLOGY.md](forecast/METHODOLOGY.md)**.

```bash
cd ml-service && source venv/bin/activate
python -m training.forecast.train       # ~10 min -> models/forecast/v2/config.json (+ validation rows of comparison.csv)
python -m training.forecast.evaluate    # ~5 min  -> models/forecast/v2/REPORT.md, metrics.json, comparison.csv
python -m training.forecast.train --no-mask --out /tmp/nomask   # the same selection without anomaly masking
```

The forecasters are refitted on the live ledger at every run, so the artifact
is the *choice* of method and settings (`config.json`), not fitted weights.
v2 scores every simulated company with the anomaly model (`models/anomaly/v1`)
and leaves the flagged months out of the fits. `models/forecast/v1/` is the
previous, unmasked model, kept for comparison and as a rollback.

| File | Role |
|---|---|
| `bench.py` | seed roles (validation shared with the anomaly model; fresh test companies 51–60 for v2), time windows, anomaly masks, rolling-origin backtest |
| `candidates.py` | the baselines, Holt-Winters and Prophet settings compared |
| `compare.py` | the shared comparison format (`comparison.csv`) other models' results are appended to |
| `train.py` | validation backtest of every candidate; picks the production model |
| `evaluate.py` | test-window results, target check, stress test; writes `REPORT.md` |
