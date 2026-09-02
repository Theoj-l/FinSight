# FinSight

OC Blueberry FYP

## Architecture

Two deployable services:

| Path         | Stack                                             | Port | Role                                              |
| ------------ | ------------------------------------------------- | ---- | ------------------------------------------------- |
| `web/`       | Next.js 16 (App Router), React 19, Tailwind, Prisma | 3000 | UI **and** API — route handlers + server actions  |
| `ml-service/`| Python, FastAPI, Uvicorn                          | 8000 | Model training (offline) and inference (HTTP API) |

The browser only talks to `web/`. `web/` talks to `ml-service/` server-side over
HTTP, authenticating with a shared secret (`ML_SERVICE_TOKEN`) in the
`x-ml-service-token` header. Persistent data lives in Supabase Postgres, accessed
from `web/` through Prisma. Auth is Supabase Auth (email + password). The ML
service is stateless.

```
web/
  proxy.ts          refreshes the Supabase session, guards protected routes
  app/
    api/            route handlers (the "backend")
    auth/           server actions (login/signup/signout) + email confirm route
    (auth)/         login + signup pages (shared card layout)
    dashboard/      example protected page
    page.tsx        landing page
  lib/
    db.ts           Prisma client singleton
    ml-client.ts    typed client for ml-service
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

Protected routes are listed in `web/lib/supabase/proxy.ts` (`/dashboard` for now).

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

`npm run db:studio` opens a browser DB viewer.

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

## Common Commands

| Command                              | What it does                          |
| ------------------------------------ | ------------------------------------- |
| `npm run dev`                        | Run both services with hot reload     |
| `npm run db:apply --prefix web`      | Apply `finsight_schema.sql` to Supabase |
| `npm run db:pull --prefix web`       | Re-introspect `schema.prisma` from the DB |
| `npm run db:studio --prefix web`     | Open the Prisma DB viewer             |
| `npm run lint --prefix web`          | Lint the web app                      |
| `pytest` (in `ml-service/`)          | Run ML service tests                  |
| `ruff check .` (in `ml-service/`)    | Lint the ML service                   |

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
