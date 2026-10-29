# FinSight

[![CI](https://github.com/Theoj-l/FinSight/actions/workflows/ci.yml/badge.svg)](https://github.com/Theoj-l/FinSight/actions/workflows/ci.yml)

OC Blueberry FYP

## Architecture

Two deployable services:

| Path          | Stack                                               | Port | Role                                              |
| ------------- | --------------------------------------------------- | ---- | ------------------------------------------------- |
| `web/`        | Next.js 16 (App Router), React 19, Tailwind, Prisma | 3000 | UI **and** API — route handlers + server actions  |
| `ml-service/` | Python, FastAPI, Uvicorn                            | 8000 | Model training (offline) and inference (HTTP API) |

The browser only talks to `web/`. `web/` talks to `ml-service/` server-side over
HTTP, authenticating with a shared secret (`ML_SERVICE_TOKEN`) in the
`x-ml-service-token` header. Persistent data lives in Supabase Postgres, accessed
from `web/` through Prisma. Auth is Supabase Auth (email + password). The ML
service is stateless.

```
web/
  proxy.ts          refreshes the Supabase session, guards protected routes
  app/
    api/            route handlers (the "backend"), incl. chat/classify (Gemini)
    auth/           server actions (login/signup/signout) + email confirm route
    (auth)/         card-based sign-in and account creation pages
    home/           signed-in overview, dated KPIs and threshold notifications
    assistant/      conversational workspace (in development)
    dashboard/      detailed financial dashboard
    page.tsx        public landing page; signed-in users go to Home
  lib/
    db.ts           Prisma client singleton
    ml-client.ts    typed client for ml-service
    gemini/         Gemini client + classifier for the dashboard chatbot
    supabase/       browser + server Supabase clients, proxy session helper
  prisma/
    finsight_schema.sql   hand-authored DDL — source of truth for the 17 tables
    schema.prisma         introspected from the DB (do not hand-edit models)
ml-service/
  app/              FastAPI serving layer
    main.py
    config.py
    security.py
    routers/
  training/         offline scripts/notebooks that produce model artifacts
  models/           committed model artifacts (anomaly/v1/, forecast/v2/ + v1/); ship in the image
  DEPLOY.md         Railway deployment: API service + monthly forecast cron
  tests/
```

## Prerequisites

- Node.js and npm
- Python 3.14 (`npm run setup` checks for it)
- Git
- A Postgres database (local, or a free hosted one — Neon / Supabase / Railway)

```bash
node --version
npm --version
python3.14 --version
```

## First-Time Setup

From the repository root:

```bash
npm run setup
```

This one command:

- installs Node dependencies (root + `web/`, and generates the Prisma client)
- creates `ml-service/venv` with Python 3.14 and installs the Python dependencies
- creates `web/.env` and `ml-service/.env` from the templates (only if they
  don't already exist)

It does **not** touch the database and does **not** overwrite existing env files.

### Fill in the env files

In `web/.env` (read by both Next.js and the Prisma CLI):

- `DATABASE_URL` — Supabase **transaction pooler**, port 6543 (app queries)
- `DIRECT_URL` — Supabase **session pooler**, port 5432 (Prisma migrations / `db pull`).
  The `db.<ref>.supabase.co` "direct" host is IPv6-only without the paid IPv4
  add-on, so use the session pooler URL here instead.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase → Project Settings → API
- `GEMINI_API_KEY` — server-only, powers the dashboard chatbot's intent
  classification (`lib/gemini/`). Get a key from
  [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Required —
  the app throws on startup without it.

Both DB strings are under Supabase → Project Settings → Database. URL-encode any
special characters in the password (`@` → `%40`, etc.). Use the **same**
`ML_SERVICE_TOKEN` in `web/.env` and `ml-service/.env`.

### Activate the venv for Python work

`npm run dev` and `npm run setup` call the venv directly, but for running
`pytest`, `ruff`, etc. by hand, activate it first:

```powershell
.\ml-service\venv\Scripts\Activate.ps1   # Windows
```

```bash
source ml-service/venv/bin/activate       # macOS / Linux
```

### Supabase Auth settings

In the Supabase dashboard:

- **Authentication → URL Configuration** — set Site URL to `http://localhost:3000`
  (add the deployed URL later).
- Public account creation remains available pending the team's access-policy decision.
  The app does not change hosted Supabase Auth settings. Keep the Email provider
  and **Allow new users to sign up** enabled to support `/signup`.
- Landing-page entry links go to `/login` by default. Users can choose **Create an
  account** from the sign-in card. Registration validates email and an eight-character
  minimum password, then uses the existing Supabase signup flow.
- With email confirmation enabled, users return to sign-in with an inbox notice.
  Configure the confirmation email template with
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}`.
  With confirmation disabled, a new session redirects to `/home`.
- No password-reset link is shown because the app has no complete reset flow.

Protected routes are listed in `web/lib/supabase/proxy.ts`: `/home`, `/dashboard`,
`/assistant`, `/insights`, `/reports`, and `/settings`. Successful sign-in defaults to `/home`;
an explicit local return path is preserved. The FinSight logo and Home navigation
item return to the overview.

Home reads the latest company-wide ledger KPIs and the shared financial rules
stored in the database. Its financial notification source is saved in Settings;
a temporary dashboard source selection does not change that policy. Each KPI
shows its reporting month and comparison basis. Only unfavorable deviations
exceeding an enabled metric's tolerance create financial notifications.
Notifications occupy the full width below the financial snapshot on Home; there
is no separate monitoring coverage card. Anomaly freshness and availability
appear in the notification footer, while financial coverage notices sit with the
snapshot.
The notification panel previews two items, with View all / Show fewer controls
and a bounded scroll area. Items are marked viewed when visible; users can clear
one or all viewed items without clearing unread items outside the preview. Notification,
viewed, and cleared dates persist per account in that browser (clearing browser
storage resets history); dates use Singapore time. Cleared issues remain cleared
for the same reporting period and threshold configuration.

Settings → Notifications controls in-app delivery: as new issues are found,
once per 24 hours, or once per 7 days. The first batch is immediate; subsequent
new issues wait for the selected interval. Home checks delivery every 30 seconds
while open and on return, using its loaded KPI data; refresh Home for updated
financial data. These preferences do not schedule email or push notifications.

The overview's load time is separate from the reporting period
and does not represent a ledger sync time. Anomaly notifications use the latest
successfully scored month and expand to show reasons and supporting records.

Assistant is accessible from the sidebar and Home shortcuts. Its page currently
shows the planned conversational experience; the existing question classifier
does not yet provide financial answers. The dashboard now reads stored forecast
estimates; opening a page never trains or scores a model.

### Financial comparisons and shared settings

The dashboard's **Compare against** selector applies **Default — Previous month**,
**Budget**, **Auto forecast**, or **Manual forecast** to the KPI cards, compatible
charts, and P&L. Source and Net/Gross switches use preloaded data and native URL
history, without a server navigation. Actual ledger amounts stay unchanged.
Planned future months can be selected; missing actuals and variances remain
unavailable. The initial dashboard month remains the latest actual month.

Settings adds **Threshold Settings** and **Budgets & Forecasts**. Rules are shared
company-wide; notification frequency and inbox history remain browser-local.
Budgets reuse `budget` / `budget_pbalance`; manual revenue/profit estimates are
stored separately. Blank means unavailable, while `0` is an explicit value.
Budget subtotals require their component groups to be populated, including
explicit zeros. Multiple scenarios are never added together; choose a scenario
on the dashboard and separately save Home's scenario when using Budget alerts.

Auto comparisons support operating revenue and final profit only. Historical
references prefer archived forecasts issued before the target month, otherwise
use clearly labelled causal rolling backtests. Missing department coverage is
unavailable. Forecast origin and limitations are expandable; accuracy/ranges
remain available on Forecast. Branch-attributed ledger comparisons remain
unsupported. Invoice/category breakdowns show actuals with coverage notes.

See the [implementation and test report](docs/financial-comparison-implementation-report.md)
for the before/after comparison, calculation examples, edge cases, and results.
Run `npm run build --prefix web -- --webpack` before the focused browser command;
it uses the compiled CSS. Run these sequentially, since a build replaces those assets.

### Database

The 17 AutoCount ledger tables are defined in `web/prisma/finsight_schema.sql`
(hand-authored — it carries `COMMENT ON COLUMN` and row-level security that Prisma
migrations can't express). `schema.prisma` is **introspected** from the database,
not the other way round. This ledger data is company-wide, not per-user — there
is no link to `auth.users`; being signed in is the only authorization.

Workflow when the schema changes:

```bash
cd web
# Fresh database only: create the full schema
npm run db:apply
npm run db:pull       # regenerate schema.prisma from the DB
npm run db:generate   # regenerate the typed client
```

For an existing database, use an additive upgrade instead of replaying the
full schema. The financial comparison upgrade has been applied to the configured
database. Apply it separately in another environment before running
the updated web app:

```bash
cd web
npm run db:apply -- prisma/financial-comparison.sql
npm run db:pull
npm run db:generate
```

`financial-comparison.sql` is idempotent and only adds the shared settings/manual
forecast structures, constraints and RLS. Prisma models are introspected, not
hand-maintained. Existing ledger, budgets and model outputs are retained.
`npm run verify:financial:db --prefix web` performs real reads/writes inside a
deliberately rolled-back transaction and checks table fingerprints afterwards.

`npm run db:studio` opens a browser DB viewer. `db:pull` keeps the `generator`
block, so the `binaryTargets` the Docker / Vercel images need survives
re-introspection.

### Synthetic dataset

The tables are populated with a generated TSH Group dataset (2021–2026, ~105k GL
lines) produced by `ml-service/datagen` (its deps come with `npm run setup`).
Anomaly labels and run metadata live in a separate `datagen` schema that Prisma
does not introspect. To regenerate or reset:

```bash
cd ml-service && source venv/bin/activate
python -m datagen --load    # generate, validate, load
```

See [ml-service/datagen/DATA_MODEL.md](ml-service/datagen/DATA_MODEL.md) for the
business model, every table's meaning, the embedded patterns, and the anomalies.

### Anomaly alerts

`ml-service` scores the ledger and stores the results in two tables,
`anomaly_alert` (current alerts) and `anomaly_run` (one row per scoring run).
The dashboard reads them with Prisma through
[web/app/dashboard/data/anomalies.ts](web/app/dashboard/data/anomalies.ts) and
never calls the model. Alerts are refreshed:

- automatically after `python -m datagen --load`
- by `python -m app.anomaly.score` (from `ml-service/`; what a nightly cron runs)
- by `POST /anomalies/rescore` on ml-service (`mlClient.rescoreAnomalies()` from `web/`)

The served model, `ml-service/models/anomaly/v1/`, is committed, so scoring
works straight after a clone and the deployed image carries exactly the model
evaluated in its `REPORT.md`. To change it, retrain
(`python -m training.anomaly.train`, ~90 s, deterministic), re-run
`python -m training.anomaly.evaluate`, and commit the folder. How the model
works: [ml-service/training/anomaly/METHODOLOGY.md](ml-service/training/anomaly/METHODOLOGY.md).

### Forecasts

`ml-service` forecasts revenue, cost and net profit per department 12 months
ahead, and stores each run in `forecast_run` / `forecast_value`, together with a
24-month backtest that gives the accuracy and the band. The dashboard reads them
through [web/app/dashboard/data/forecast.ts](web/app/dashboard/data/forecast.ts)
(`getForecast(scope)`; contract in
[web/app/dashboard/README.md](web/app/dashboard/README.md#forecasts)) and never
calls the model. Forecasts are refreshed:

- automatically after `python -m datagen --load`
- by `python -m app.forecast.run` (from `ml-service/`; what the monthly cron runs)
- by `POST /forecast/run` on ml-service (`mlClient.runForecast()` from `web/`)

The selected forecaster (`ml-service/models/forecast/v2/config.json`) was chosen
by backtesting baselines, Holt-Winters and Prophet. From v2 it leaves the months
the anomaly model flagged out of its fits, so run anomaly scoring before
forecasting (the crons do: anomaly nightly, forecast monthly an hour later). Results are in its
`REPORT.md`, and the method in
[ml-service/training/forecast/METHODOLOGY.md](ml-service/training/forecast/METHODOLOGY.md).
Deploying to Railway: [ml-service/DEPLOY.md](ml-service/DEPLOY.md).

## Run the Application

```bash
npm run dev
```

Starts both services:

- Web: http://localhost:3000
- ML service: http://localhost:8000 (docs at http://localhost:8000/docs)

Check the wiring: http://localhost:3000/api/health and
http://localhost:3000/api/ml/health (the second proxies to the ML service).

`npm run dev:terminals` opens each service in its own terminal window instead.

To stop, press `Ctrl+C`.

## Testing

| Suite                       | Location                              | Command                         |
| --------------------------- | ------------------------------------- | ------------------------------- |
| Unit / integration — Vitest | `web/`, `*.test.ts` beside the source | `npm test --prefix web`         |
| End-to-end — Playwright     | `web/e2e/`                            | `npm run test:e2e --prefix web` |
| ML service — pytest         | `ml-service/tests/`                   | `pytest` (with the venv active) |

First Playwright run only: `npx playwright install chromium webkit firefox` in `web/`.

**CI** — [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the `web/`
lint, typecheck, Vitest and Playwright suites on every push to `main` and every
pull request, against placeholder env values (the suites mock Supabase and the
ML service, so no real project or database is involved). The ML-service pytest
suite is local-only for now.

## Run with Docker

An alternative to the local toolchain — you only need Docker Desktop (no Node,
Python, or venv). Both services are containerised; Supabase Postgres is still
external, so `web/.env` and `ml-service/.env` must already exist (run
`npm run setup` once, or copy the `.env.example` files by hand).

| Path                          | Image                                 | Serves                                                                        |
| ----------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| `web/Dockerfile`              | multi-stage; `dev` + `runner` targets | Next.js standalone server on 3000                                             |
| `ml-service/Dockerfile`       | multi-stage; `dev` + `runner` targets | Uvicorn on 8000                                                               |
| `docker-compose.yml`          | —                                     | both, on a private network (`web` → `ml-service` at `http://ml-service:8000`) |
| `docker-compose.override.yml` | —                                     | dev overlay: `next dev` / `uvicorn --reload`, source bind-mounted             |
| `web/Dockerfile.vercel`       | deploy only (not in compose)          | Next.js standalone server on `$PORT` — see [Deploying](#deploying)            |

### Development (hot reload)

```bash
npm run docker:dev        # docker compose --env-file web/.env up --build
```

Edits on the host reload inside the containers. `node_modules` and the venv live
in the images, not on the host. Same URLs as `npm run dev`
(http://localhost:3000, http://localhost:8000).

### Production images

```bash
npm run docker:up         # build + start the minimal runner images, detached
npm run docker:logs       # tail logs
npm run docker:down       # stop and remove
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are compiled into
the browser bundle at image-build time — the `--env-file web/.env` in the
`docker:*` scripts feeds them to the build. Rebuild the `web` image after
changing either value. All other config is read at container start from the
`env_file`s, with `ML_SERVICE_URL` overridden to the compose service name.

> On Windows/macOS the dev overlay polls for file changes (`WATCHPACK_POLLING`),
> which uses more CPU than `npm run dev`. For day-to-day work the local
> toolchain is lighter; Docker is here for deploy parity and clean-machine runs.

### Deploying

| Service       | Target             | How                                                                                                                                                                                                                                      |
| ------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/`        | Vercel             | Native Next.js build (recommended) — set the project **Root Directory** to `web`, add the env vars in Project Settings. No Docker involved.                                                                                              |
| `web/`        | Vercel (container) | Optional. `web/Dockerfile.vercel` — Vercel auto-detects it and runs the image on a Function. Needs Root Directory `web` and `NEXT_PUBLIC_*` in Project Settings (forwarded to the build). Only worth it if you outgrow the native build. |
| `ml-service/` | Railway            | Point the service at `ml-service/`; Railway builds `ml-service/Dockerfile`. Override the start command / port to bind Railway's `$PORT` (the image defaults to 8000). Give it a public domain and set `ML_SERVICE_TOKEN` to match `web`. |

`web/Dockerfile` (generic) and `web/Dockerfile.vercel` (Vercel Functions: listens
on `$PORT`, default 80) are separate on purpose — keep them in sync when the
build changes.

#### `ml-service` on Railway: anomaly scoring

The image already contains the trained model (`models/anomaly/v1/`), so nothing
is trained on Railway. Set these variables on the service:

| Variable           | Value                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ML_SERVICE_TOKEN` | same value as in `web`                                                                                                                                      |
| `DATABASE_URL`     | Supabase **session pooler** URL (port 5432), the same as in `ml-service/.env`. Not the transaction pooler (6543): a scoring run takes a session-level lock. |

- **Memory:** a scoring run peaks at about 500 MB. Give the service at least 1 GB.
- **Nightly refresh:** add a second Railway service from the same repo and Root
  Directory. Set its start command to `python -m app.anomaly.score` and give it a
  cron schedule, for example `0 18 * * *` (02:00 Singapore; Railway cron runs in
  UTC). It needs `DATABASE_URL` only. A run takes 5–15 s, then exits; exit code 0
  means the alerts were refreshed.
- `web/` reads the alerts from Supabase, not from this service. It needs
  `ML_SERVICE_URL` only for `mlClient.rescoreAnomalies()`.

Check a deploy:

```bash
curl https://<ml-service-domain>/health
curl -X POST -H "x-ml-service-token: <token>" https://<ml-service-domain>/anomalies/rescore
# {"run_id": …, "scored_through": 202608, "n_alerts": 57, …}
# 503 means DATABASE_URL is missing; 401 means the token does not match.
```

## Common Commands

| Command                                       | What it does                                                          |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `npm run dev`                                 | Run both services with hot reload                                     |
| `npm run docker:dev`                          | Same, in containers (hot reload)                                      |
| `npm run docker:up` / `docker:down`           | Start / stop the production images                                    |
| `npm run db:apply --prefix web`               | Apply `finsight_schema.sql` to Supabase                               |
| `npm run db:pull --prefix web`                | Re-introspect `schema.prisma` from the DB                             |
| `npm run db:studio --prefix web`              | Open the Prisma DB viewer                                             |
| `npm run lint --prefix web`                   | Lint the web app                                                      |
| `npm test --prefix web`                       | Web unit tests (Vitest)                                               |
| `npm run test:e2e --prefix web`               | Web end-to-end tests (Playwright)                                     |
| `npm run test:anomalies:browser --prefix web` | Comparison, Settings and anomaly browser checks (controlled auth/API) |
| `npm run verify:financial:db --prefix web`    | Real financial save/read checks; rolls back all verification writes   |
| `pytest` (in `ml-service/`)                   | Run ML service tests                                                  |
| `ruff check .` (in `ml-service/`)             | Lint the ML service                                                   |

## Git Conventions

### Commit Messages

```text
type: short description
```

Imperative mood, no trailing period, short enough to scan. Types: `feat`, `fix`,
`refactor`, `docs`, `test`, `chore`.

```text
feat: add FastAPI ML service
fix: handle missing transaction data
docs: add local development setup
chore: update Python dependencies
```

### Branch Names

```text
type/short-description
```

Lowercase, hyphen-separated. Types: `feature/`, `fix/`, `refactor/`, `docs/`,
`test/`, `chore/`.

```bash
git switch -c feature/short-description
git status
git diff
git add .
git commit -m "type: short description"
```

Deployment edit
