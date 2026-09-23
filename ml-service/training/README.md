# Training

Offline scripts and notebooks that build model artifacts. This code is **not**
shipped with the serving container.

Convention:

- One entry point per model, writing artifacts to `../models/<model>/<version>/`.
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
