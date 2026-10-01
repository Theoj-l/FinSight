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
    (auth)/         login + signup pages (shared card layout)
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
  models/           trained artifacts (gitignored)
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
- **Authentication → Sign In / Providers → Email** — for local dev, turn
  **"Confirm email" off** so sign-up logs you straight in. When you turn it back
  on, point the confirmation email template at
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}`
  (handled by `web/app/auth/confirm/route.ts`).

Protected routes are listed in `web/lib/supabase/proxy.ts`: `/home`, `/dashboard`,
`/assistant`, `/insights`, `/reports`, and `/settings`. Successful sign-in defaults to `/home`;
an explicit local return path is preserved. The FinSight logo and Home navigation
item return to the overview.

Home reads the latest company-wide ledger KPIs and uses the same per-account,
browser-local thresholds as the dashboard. Each KPI shows its reporting month
and comparison month. Only unfavorable threshold breaches create notifications.
Notifications and monitoring sit side by side on desktop and stack on mobile.
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
and does not represent a ledger sync time. Anomaly monitoring is shown as not
connected until an anomaly results feed is available.

Assistant is accessible from the sidebar and Home shortcuts. Its page currently
shows the planned conversational experience; the existing question classifier
does not yet provide financial answers. Forecasting will run in the backend and
can supply dated predictions to the assistant and financial views once connected.

### Database

The 17 AutoCount ledger tables are defined in `web/prisma/finsight_schema.sql`
(hand-authored — it carries `COMMENT ON COLUMN` and row-level security that Prisma
migrations can't express). `schema.prisma` is **introspected** from the database,
not the other way round. This ledger data is company-wide, not per-user — there
is no link to `auth.users`; being signed in is the only authorization.

Workflow when the schema changes:

```bash
cd web
# 1. edit prisma/finsight_schema.sql
npm run db:apply      # runs the SQL against Supabase (via DIRECT_URL)
npm run db:pull       # regenerate schema.prisma from the DB
npm run db:generate   # regenerate the typed client
```

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

First Playwright run only: `npx playwright install chromium` in `web/`.

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

## Common Commands

| Command                             | What it does                              |
| ----------------------------------- | ----------------------------------------- |
| `npm run dev`                       | Run both services with hot reload         |
| `npm run docker:dev`                | Same, in containers (hot reload)          |
| `npm run docker:up` / `docker:down` | Start / stop the production images        |
| `npm run db:apply --prefix web`     | Apply `finsight_schema.sql` to Supabase   |
| `npm run db:pull --prefix web`      | Re-introspect `schema.prisma` from the DB |
| `npm run db:studio --prefix web`    | Open the Prisma DB viewer                 |
| `npm run lint --prefix web`         | Lint the web app                          |
| `npm test --prefix web`             | Web unit tests (Vitest)                   |
| `npm run test:e2e --prefix web`     | Web end-to-end tests (Playwright)         |
| `pytest` (in `ml-service/`)         | Run ML service tests                      |
| `ruff check .` (in `ml-service/`)   | Lint the ML service                       |

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
