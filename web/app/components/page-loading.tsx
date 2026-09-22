import { LoaderCircle } from "lucide-react";

export function PageLoading() {
  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center" role="status" aria-label="Loading page" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <LoaderCircle aria-hidden="true" className="h-12 w-12 animate-spin text-[#6f95d5] drop-shadow-[0_2px_6px_rgba(76,111,187,0.22)]" strokeWidth={2.4} />
        <span className="text-sm font-medium tracking-wide text-brand-navy">Loading Page...</span>
      </div>
    </div>
  );
}
