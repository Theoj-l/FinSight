import { CardGridSkeleton, RouteLoading } from "@/app/components/route-loading";

export default function Loading() {
  return (
    <RouteLoading label="assistant">
      <div aria-hidden="true" className="mt-8 h-64 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
      <CardGridSkeleton />
    </RouteLoading>
  );
}
