// ---------------------------------------------------------------------------
// tour-labels.ts — the labelled parts of a page that the assistant can point at.
//
// Each label has a stable id (what the AI returns), a number (the badge shown
// on the page) and a title (what the card shows). The AI never sends titles or
// numbers; it only sends ids, so the UI stays the single source of wording.
// Pure: no imports, no I/O.
// ---------------------------------------------------------------------------

export const TOUR_LABELS = {
  filters: { number: 1, title: "Reporting scope filters" },
  "kpi-cards": { number: 2, title: "Financial overview (KPI cards)" },
  "revenue-vs-expenses": { number: 3, title: "Revenue vs Operating Expenses" },
  "profit-margin": { number: 4, title: "Net Profit and Margin" },
  "revenue-by-group": { number: 5, title: "Revenue by Product Group" },
  "profit-loss": { number: 6, title: "Profit and Loss Statement" },
} as const;

export type TourLabelId = keyof typeof TOUR_LABELS;

export function isTourLabelId(value: unknown): value is TourLabelId {
  return typeof value === "string" && Object.hasOwn(TOUR_LABELS, value);
}
