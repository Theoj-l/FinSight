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
  "comparison-source": { number: 2, title: "Compare against (comparison source)" },
  "kpi-cards": { number: 3, title: "Financial overview (KPI cards)" },
  anomalies: { number: 4, title: "Anomalies to review" },
  "profit-yoy": { number: 5, title: "Profit Year-Over-Year Comparison" },
  "revenue-vs-expenses": { number: 6, title: "Revenue vs Operating Expenses" },
  "profit-margin": { number: 7, title: "Net Profit and Margin" },
  "revenue-by-group": { number: 8, title: "Revenue by Product Group" },
  "revenue-by-business-type": { number: 9, title: "Revenue by Business Type" },
  "expense-by-category": { number: 10, title: "Operating Expenses by Category" },
  "expense-by-business-type": { number: 11, title: "Operating Expenses by Business Type" },
  "profit-loss": { number: 12, title: "Profit and Loss Statement" },
} as const;

export type TourLabelId = keyof typeof TOUR_LABELS;

export function isTourLabelId(value: unknown): value is TourLabelId {
  return typeof value === "string" && Object.hasOwn(TOUR_LABELS, value);
}
