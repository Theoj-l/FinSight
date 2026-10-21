// ---------------------------------------------------------------------------
// chat-context.ts — what the user is looking at, sent along with each question.
//
// When the dashboard is open the assistant should explain the period and filters
// the charts are actually showing, not guess. This reads them from the page
// address (the dashboard keeps its filters there). Pure: no React, no DOM.
// ---------------------------------------------------------------------------

import { tourPageFor, type TourPage } from "../tour/tour-script";

export interface ChatContext {
  page: TourPage;
  /** First month on screen, as YYYYMM. Absent means the dashboard default (latest month). */
  periodStart?: string;
  periodEnd?: string;
  /** Business-unit (department) codes. Empty means all. */
  units: string[];
  /** Branch codes. Empty means all. */
  branches: string[];
}

/** The context for a page, or null when the page has nothing the assistant can point at. */
export function readChatContext(pathname: string, search: string): ChatContext | null {
  const page = tourPageFor(pathname);
  if (!page) return null;

  const params = new URLSearchParams(search);
  const periodStart = params.get("periodStart") ?? params.get("period") ?? undefined;
  const periodEnd = params.get("periodEnd") ?? periodStart;

  return {
    page,
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd } : {}),
    units: params.getAll("unit").filter(Boolean),
    branches: params.getAll("branch").filter(Boolean),
  };
}
