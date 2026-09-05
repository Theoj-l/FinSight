# FinSight Dashboard Instructions

## Project Context

FinSight is a financial analytics dashboard for TSH Group.

The repository contains:

- `web/`: Next.js 16 App Router application
- `ml-service/`: Python 3.14 FastAPI service
- Supabase PostgreSQL database
- Prisma 6 ORM in the web application
- Supabase Auth for email/password authentication
- Tailwind CSS 4
- Recharts for dashboard visualizations

The browser should communicate only with the Next.js application. Do not call
the FastAPI service or PostgreSQL directly from browser code.

## Technology Stack

Frontend and web backend:

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Prisma 6
- Supabase Auth
- Recharts

ML backend:

- Python 3.14
- FastAPI
- Uvicorn
- Pydantic
- pandas and NumPy

Database:

- Supabase PostgreSQL
- Prisma models are introspected from the database
- `web/prisma/finsight_schema.sql` is the source of truth for schema changes
- `web/prisma/schema.prisma` must not be hand-edited

## Dashboard Structure

All dashboard-specific UI components must be created in:

`web/app/dashboard/components`

Keep the route page at:

`web/app/dashboard/page.tsx`

Recommended component organization:

- `dashboard-shell.tsx`
- `dashboard-header.tsx`
- `dashboard-filters.tsx`
- `revenue-expense-chart.tsx`
- `profit-margin-chart.tsx`
- `revenue-by-group-chart.tsx`
- `expense-category-chart.tsx`
- `profit-loss-table.tsx`
- `chart-empty-state.tsx`
- `chart-loading.tsx`
- `chart-error.tsx`

Do not place dashboard components in unrelated global directories.

Store dashboard-specific tests in:

`web/app/dashboard/test`

Keep test files out of the `components` and `data` directories.

Use Server Components by default. Add `"use client"` only to components
that require Recharts, browser events, state, or client-side interaction.

## Data Access

Use `prisma` from `web/lib/db.ts` for database queries.

Do not query Prisma from client components.

Use either:

1. A Server Component that queries Prisma directly for initial page data, or
2. An authenticated Next.js route handler under `web/app/api/` for interactive
   client-side fetching.

Because `web/proxy.ts` skips API routes, every protected API route must verify
the user explicitly with:

```ts
const supabase = await createClient();
const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}