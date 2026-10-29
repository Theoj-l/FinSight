
## Loading Convention

Use the shared `web/app/components/page-loading.tsx` component for loading
caused by data refreshes or other transitions that happen within an already
rendered page. It should appear at the center of the user's viewport as an
unboxed loading treatment with a polished, visible light-blue spinner and the
short `Loading Page` label beneath it. The spinner may use a fixed,
transparent positioning layer so it stays centered while the user is viewing
any part of the page. Any scrim or dimming must be applied only to the rendered
page content area, not the app shell or navbar. Do not add a card, border,
background panel, banner, progress line, or bottom toast around the spinner and
label. It must not become a separate full-page blocking screen.
While it is visible, disable or dim stale interactive content as appropriate so
users cannot submit conflicting actions.
Keep the component reusable for any in-page data refresh, not only dashboard
filters.

The app shell's thin top progress bar is a separate navigation convention for
switching between navbar routes. Keep that navigation indicator unchanged;
do not use `PageLoading` for route navigation.


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

Keep the route page (and its `loading.tsx` skeleton) at:

`web/app/(app)/dashboard/page.tsx`

The `(app)` route group holds the route entry files of every signed-in page
(home, dashboard, assistant, forecast, reports, settings). Its `layout.tsx`
renders the sidebar once, so it stays mounted between pages; pages render only
their own content (no sidebar wrapper). The group name is not part of the URL.
Every page there needs a `loading.tsx` so navigation shows feedback at once.

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

In pages and layouts, get the user with `requireUser()` / `getSessionUser()` from
`web/lib/auth/require-user.ts`. They verify the session JWT locally, with no
round trip to Supabase Auth on each page load.

Do not query Prisma from client components.

## Dashboard Data Performance

Keep dashboard data pulls small and database-driven:

- Run independent dashboard loaders concurrently or stream panels with Suspense; never create a sequential query waterfall.
- Aggregate large tables such as `pbalance` and `iv_dtl` in PostgreSQL before returning data to the server component. Do not load raw ledger or invoice-detail rows when the UI needs grouped totals.
- Select only the columns required by the DTO and preserve active dashboard filters in every query.
- Use SQL `SELECT DISTINCT` (`$queryRaw`) for distinct values. Prisma's `findMany({ distinct })` fetches every row and de-duplicates in Node.
- Cache low-change metadata such as filter options and `pl_format` with bounded revalidation. Do not cache user-specific financial results without including the complete scope in the cache key.
- Do not query dashboard panels when filter parsing has already failed.
- Keep server-only Prisma access in dashboard data modules and pass plain serialized DTOs to client components.

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