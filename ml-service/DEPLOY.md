# Deploying ml-service to Railway

ml-service ships as one Docker image (`Dockerfile`, final stage `runner`). On
Railway that image runs as up to three services from the same repo:

| Service | What it does | Config file | Needs a domain |
|---|---|---|---|
| **ml-service** | FastAPI: `/health`, `POST /anomalies/rescore`, `POST /forecast/run` | `/ml-service/railway.json` | yes (web/ calls it) |
| **ml-anomaly-cron** | `python -m app.anomaly.score` at 02:00 SGT every night, then exits | `/ml-service/railway.anomaly-cron.json` | no |
| **ml-forecast-cron** | `python -m app.forecast.run` at 03:00 SGT on the 2nd of every month, then exits | `/ml-service/railway.forecast-cron.json` | no |

**Deploy both crons.** Forecast model v2 leaves the months the anomaly model
flagged out of its fits, reading them from the `anomaly_alert` table. The forecast
cron therefore runs an hour after the nightly anomaly scoring. Without anomaly
scoring the forecast still runs, but masks nothing and is less accurate; its
`forecast_run.summary.anomaly_mask.cells` will be 0.

Nothing needs uploading. The models the image serves are committed to git:
`models/anomaly/v1/` (the trained anomaly model) and `models/forecast/v2/`
(the selected forecaster; `v1` is kept as a rollback). The Dockerfile copies them in.

The crons and the API write to the same Supabase tables (`anomaly_*`,
`forecast_*`). The dashboard reads those tables through Prisma and never calls
the model, so the crons are what keep the dashboard current.

## 1. API service

1. In Railway: **New project → Deploy from GitHub repo →** the FinSight repo, branch `main`.
2. Open the service, then **Settings**:
   - **Root Directory:** `/ml-service`
   - **Config-as-code file path:** `/ml-service/railway.json`. The path is absolute from the repo root; Railway does not look inside the root directory for it.
   - Everything else comes from the config file: Dockerfile build, health check on `/health`, restart on failure, and redeploys only when something under `/ml-service/` changes.
3. **Variables:**

   | Variable | Value |
   |---|---|
   | `ML_SERVICE_TOKEN` | A long random string. **The same value** goes into Vercel's `ML_SERVICE_TOKEN`. |
   | `DATABASE_URL` | The Supabase **session pooler** URL, port **5432**: the same value as `DIRECT_URL` in `web/.env`. Not the transaction pooler (6543): scoring and forecasting take a session-level lock. Not `db.<ref>.supabase.co`: that host is IPv6-only. URL-encode `@` in the password as `%40`. |
   | `MODELS_DIR`, `ANOMALY_MODEL_VERSION`, `FORECAST_MODEL_VERSION` | Optional. They default to `models`, `v1` and `v2`. Setting `FORECAST_MODEL_VERSION=v1` rolls the forecast back to v1. |
   | `FORECAST_JOBS` | Optional, default 8. The number of series a forecast run fits in parallel threads. Leave it at the default. |

   Do not set `PORT`. Railway sets it and the image listens on it.
4. **Settings → Networking → Generate Domain.**
5. Deploy. The deploy goes green once `GET /health` answers.

## 2. Point the web app at it (Vercel)

Set these on the Vercel project and redeploy:

- `ML_SERVICE_URL` = `https://<the Railway domain>` (no trailing slash)
- `ML_SERVICE_TOKEN` = the same value as on Railway

## 3. Smoke test

```bash
curl https://<domain>/health
# {"status":"ok","service":"ml-service"}

curl -X POST https://<domain>/forecast/run -H "x-ml-service-token: <token>"
# {"run_id":…,"history_through":202608,"n_forecast":288,"accuracy":{"revenue":…,"cost":…,"profit":…},…}

curl -X POST https://<domain>/anomalies/rescore -H "x-ml-service-token: <token>"
```

Then check Supabase: `forecast_run` and `anomaly_run` each have a new row with `status = 'ok'`.
The forecast POST is also the way to fill the forecast tables for the first time, without waiting for the cron. It answers when the run finishes, which can take a minute or two on a small instance. Call it with curl, not through a Vercel function: those time out sooner.

## 4. Cron services (anomaly scoring, then forecasting)

Create two cron services the same way, one per config file:

1. In the same project: **New → GitHub repo →** the same repo and branch.
2. **Settings:**
   - **Root Directory:** `/ml-service`
   - **Config-as-code file path:** `/ml-service/railway.anomaly-cron.json` for the first service, `/ml-service/railway.forecast-cron.json` for the second.
   - The schedule and start command come from the file. Railway cron schedules are in **UTC**:
     - anomaly scoring `0 18 * * *` runs at **02:00 SGT every night**;
     - forecasting `0 19 1 * *` runs at **03:00 SGT on the 2nd** of each month. The previous month has closed by then, and that night's anomaly scoring has finished.
3. **Variables:** `DATABASE_URL` (same as above). Neither needs `ML_SERVICE_TOKEN`.
4. No domain is needed. Each run takes seconds (anomaly scoring about 5 s; forecasting fits a few hundred small Holt-Winters models in about 10 s), prints one summary line and exits. Railway requires a cron job to exit, and skips a run if the previous one is still going.

To change a schedule, edit the `cronSchedule` in the JSON file and push. The config file overrides values typed into the Railway UI.

## 5. Troubleshooting

| Symptom | Cause |
|---|---|
| `/forecast/run` → 503 "no forecast model" | `models/forecast/v2/config.json` is missing from the image. Check that `.dockerignore` and `.gitignore` both contain `!models/forecast/`. |
| Forecast summary shows `anomaly_mask.cells: 0` | Anomaly scoring has not run (or found nothing). Deploy the anomaly cron, or `POST /anomalies/rescore` once. |
| 503 "… whose library is not installed" | A retrain selected a method (e.g. Prophet) whose package is only in `requirements-dev.txt`. Move its pin to `requirements.txt`. |
| 401 from ml-service | `ML_SERVICE_TOKEN` differs between Vercel and Railway. |
| 409 | A run of the same kind is already in progress; try again once it finishes. |
| Errors about prepared statements or advisory locks | `DATABASE_URL` is the transaction pooler (6543). Use the session pooler (5432). |
| Cron run "skipped" | The previous run had not exited yet. |
| Dashboard forecast empty | No successful `forecast_run` yet: POST `/forecast/run` once. |

## 6. Shipping a new model

1. Retrain locally (`training/README.md`).
2. Commit the new or changed `models/forecast/<version>/` (or `models/anomaly/v1/`), and set the default `forecast_model_version` in `app/config.py` if the version changed.
3. Push to `main`.

Railway rebuilds because the push touches `/ml-service/**`. The next cron run, or a POST, uses the new model.

## Local check of the production image

```bash
docker build --target runner -t finsight-ml ml-service
docker run --rm --env-file ml-service/.env -e PORT=8080 -p 8080:8080 finsight-ml        # API
docker run --rm --env-file ml-service/.env finsight-ml python -m app.forecast.run       # what the cron runs
```
