# datagen — FinSight synthetic dataset generator

Generates a clean, internally consistent AutoCount-shaped dataset for TSH Group
and loads it into Supabase. Phase 1.

**Read [DATA_MODEL.md](DATA_MODEL.md)** for the business model, every table's
meaning, the embedded patterns, the anomaly labels, and how to use the data for
ML. This file is just the quickstart.

## Quickstart

Dependencies come with `npm run setup` (they're in `requirements.txt`).

```bash
cd ml-service
source venv/bin/activate

python -m datagen                              # generate + validate + write output/
python -m datagen --load                       # then load into Postgres (prompts first)
python -m datagen --anomalies random --seed 7  # a benchmark dataset (random anomalies)
```

`--anomalies canonical` (the default) gives the showcase dataset with the ten
fixed anomalies A01–A10. `--anomalies random` gives 23–40 randomly placed
anomalies per seed and is used to train and test the anomaly model. See
[DATA_MODEL.md](DATA_MODEL.md) §6 and
[../training/anomaly/METHODOLOGY.md](../training/anomaly/METHODOLOGY.md).

`--load` reads `DATABASE_URL` from `ml-service/.env` (session pooler, port 5432),
**truncates** the 17 `public` tables and `datagen.anomaly_log`, and bulk-loads.
It refuses to load if any hard consistency check fails.

## What it writes

- Postgres: the 17 tables in `public` + `datagen.anomaly_log` + `datagen.run`
- `datagen/output/` (git-ignored): `*.csv`, `datagen_anomaly_log.csv`,
  `decoy_log.csv` (unlabelled look-alikes), `VALIDATION.txt`, `SUMMARY.md`

## Layout

| File | Role |
|------|------|
| `config.py` | every tunable number (business model, opex, opening balances, anomalies window) |
| `reference.py` | chart of accounts, P&L layout, dimensions, customers, items |
| `masters.py` | assembles reference + master data |
| `anomalies.py` | the ten anomaly templates; canonical A01–A10 plan, random plan, look-alikes |
| `pipeline.py` | `generate(seed, anomalies)` — seed to complete table dict (used by the CLI and training) |
| `engine.py` | the ledger + month-by-month simulation (double-entry) |
| `derive.py` | `pbalance`, `budget`, `budget_pbalance` from `gl_dtl` |
| `validate.py` | consistency checks (hard checks gate the load) |
| `report.py` | `SUMMARY.md` |
| `sinks.py` | CSV writer + Postgres bulk load |
| `sql/datagen_meta.sql` | the `datagen` schema (labels + run metadata) |

## Regenerating / resetting

Re-running `--load` fully replaces the data. To remove the label schema:
`drop schema datagen cascade;` (then regenerate). A different `--seed` produces a
different but equally consistent dataset.
