export function ForecastLoading() {
  return (
    <section className="mt-8 space-y-6" role="status" aria-label="Loading forecast">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-100" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map(item => <div key={item} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm"><div className="m-5 h-3 w-32 rounded bg-slate-100" /><div className="mx-5 mt-4 h-7 w-40 rounded bg-slate-200" /><div className="mx-5 mt-3 h-3 w-28 rounded bg-slate-100" /></div>)}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex justify-between"><div className="h-5 w-40 animate-pulse rounded bg-slate-200" /><div className="h-4 w-56 animate-pulse rounded bg-slate-100" /></div>
        <div className="mt-6 h-[360px] animate-pulse rounded-lg bg-gradient-to-br from-slate-50 via-blue-50/50 to-slate-50" />
      </div>
      <div className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
      <span className="sr-only">Loading forecast data</span>
    </section>
  );
}
