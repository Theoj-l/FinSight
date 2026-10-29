import { RouteLoading } from "@/app/components/route-loading";

export default function Loading() {
  return (
    <RouteLoading label="settings">
      <div className="mt-8 space-y-6">
        {[1, 2, 3].map(item => <div key={item} aria-hidden="true" className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />)}
      </div>
    </RouteLoading>
  );
}
