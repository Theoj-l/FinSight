import type { ReactNode } from "react";
import { TOUR_LABELS, type TourLabelId } from "./tour-labels";

/** The numbered chip shown on a labelled part of the page. */
export function TourBadge({ id }: { id: TourLabelId }) {
  const { number, title } = TOUR_LABELS[id];
  return (
    <span
      aria-hidden="true"
      title={title}
      className="tour-badge pointer-events-none absolute -left-2.5 -top-2.5 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-brand-navy px-1 text-xs font-bold text-white shadow-sm ring-2 ring-white print:hidden"
    >
      {number}
    </span>
  );
}

/** Wraps a chart, table or card so the assistant can label and highlight it. */
export function TourTarget({ id, className = "", children }: { id: TourLabelId; className?: string; children: ReactNode }) {
  return (
    <div data-tour-id={id} className={`relative ${className}`}>
      <TourBadge id={id} />
      {children}
    </div>
  );
}
