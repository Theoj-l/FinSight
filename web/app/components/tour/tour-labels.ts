// ---------------------------------------------------------------------------
// tour-labels.ts — the labelled parts of the app that the assistant can point at.
//
// Each label has a stable id (what the AI returns), the page it lives on, a
// number (the badge shown on that page, counted from 1 on each page) and a title
// (what the card shows). The AI never sends titles or numbers; it only sends
// ids, so the UI stays the single source of wording.
// Pure: no imports, no I/O.
// ---------------------------------------------------------------------------

/** Pages that have labelled parts. A walkthrough belongs to exactly one of them. */
export const TOUR_PAGES = ["dashboard", "forecast", "home"] as const;
export type TourPage = (typeof TOUR_PAGES)[number];

export const TOUR_PAGE_INFO: Record<TourPage, { path: string; name: string }> = {
  dashboard: { path: "/dashboard", name: "dashboard" },
  forecast: { path: "/forecast", name: "forecast page" },
  home: { path: "/home", name: "home page" },
};

export const TOUR_LABELS = {
  // Dashboard
  filters: { page: "dashboard", number: 1, title: "Reporting scope filters" },
  "comparison-source": { page: "dashboard", number: 2, title: "Compare against (comparison source)" },
  "kpi-cards": { page: "dashboard", number: 3, title: "Financial overview (KPI cards)" },
  anomalies: { page: "dashboard", number: 4, title: "Anomalies to review" },
  "profit-yoy": { page: "dashboard", number: 5, title: "Profit Year-Over-Year Comparison" },
  "revenue-vs-expenses": { page: "dashboard", number: 6, title: "Revenue vs Operating Expenses" },
  "profit-margin": { page: "dashboard", number: 7, title: "Net Profit and Margin" },
  "revenue-by-group": { page: "dashboard", number: 8, title: "Revenue by Product Group" },
  "revenue-by-business-type": { page: "dashboard", number: 9, title: "Revenue by Business Type" },
  "expense-by-category": { page: "dashboard", number: 10, title: "Operating Expenses by Category" },
  "expense-by-business-type": { page: "dashboard", number: 11, title: "Operating Expenses by Business Type" },
  "profit-loss": { page: "dashboard", number: 12, title: "Profit and Loss Statement" },

  // Forecast
  "forecast-filters": { page: "forecast", number: 1, title: "Forecast scope filters" },
  "forecast-metric": { page: "forecast", number: 2, title: "Metric selector (revenue, cost, profit)" },
  "forecast-summary": { page: "forecast", number: 3, title: "Forecast summary cards" },
  "forecast-chart": { page: "forecast", number: 4, title: "Actuals and projections chart" },
  "forecast-horizon": { page: "forecast", number: 5, title: "Forecast horizon table" },

  // Home
  "home-snapshot": { page: "home", number: 1, title: "Financial snapshot" },
  "home-attention": { page: "home", number: 2, title: "Needs your attention" },
} as const;

export type TourLabelId = keyof typeof TOUR_LABELS;

export function isTourLabelId(value: unknown): value is TourLabelId {
  return typeof value === "string" && Object.hasOwn(TOUR_LABELS, value);
}

export function isTourPage(value: unknown): value is TourPage {
  return typeof value === "string" && (TOUR_PAGES as readonly string[]).includes(value);
}

/** The ids of a page's labelled parts, in page order. */
export function labelsForPage(page: TourPage): TourLabelId[] {
  return (Object.keys(TOUR_LABELS) as TourLabelId[]).filter((id) => TOUR_LABELS[id].page === page);
}
