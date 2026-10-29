import type { ReactNode } from "react";

// Placeholder blocks for app/(app)/*/loading.tsx. They show the moment a
// sidebar link is clicked (Next prefetches them) and are replaced as the page
// streams in. Same look as the dashboard's panel skeletons.

const block = "animate-pulse rounded bg-slate-200";
const faint = "animate-pulse rounded bg-slate-100";

export function HeadingSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={`h-3 w-32 ${block}`} />
      <div className={`mt-3 h-8 w-52 ${block}`} />
      <div className={`mt-3 h-4 w-96 max-w-full ${faint}`} />
    </div>
  );
}

export function FilterBarSkeleton() {
  return (
    <div aria-hidden="true" className="mt-6 rounded-xl border border-brand-navy/15 bg-brand-blue-light/60 p-5">
      <div className={`h-4 w-36 ${block}`} />
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map(item => <div key={item} className="h-11 animate-pulse rounded-lg bg-white" />)}
      </div>
    </div>
  );
}

// Literal class names: Tailwind only generates classes it can find in source.
const COLUMNS = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4" } as const;

export function CardGridSkeleton({ count = 3, height = "h-40", className = "mt-8" }: { count?: keyof typeof COLUMNS; height?: string; className?: string }) {
  return (
    <div aria-hidden="true" className={`grid gap-4 ${COLUMNS[count]} ${className}`}>
      {Array.from({ length: count }, (_, item) => (
        <div key={item} className={`${height} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
          <div className={`h-10 w-10 rounded-xl ${faint}`} />
          <div className={`mt-5 h-4 w-40 ${block}`} />
          <div className={`mt-3 h-3 w-full max-w-64 ${faint}`} />
        </div>
      ))}
    </div>
  );
}

export function RouteLoading({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div role="status" aria-label={`Loading ${label}`}>
      <HeadingSkeleton />
      {children}
      <span className="sr-only">Loading {label}</span>
    </div>
  );
}
