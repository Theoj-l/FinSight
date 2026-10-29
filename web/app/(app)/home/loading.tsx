import { CardGridSkeleton } from "@/app/components/route-loading";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading home">
      <div aria-hidden="true" className="h-56 animate-pulse rounded-2xl bg-brand-navy/90" />
      <div aria-hidden="true" className="mt-8 h-5 w-44 animate-pulse rounded bg-slate-200" />
      <CardGridSkeleton count={4} height="h-44" className="mt-4" />
      <span className="sr-only">Loading home</span>
    </div>
  );
}
