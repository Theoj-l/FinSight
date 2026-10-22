// ---------------------------------------------------------------------------
// chat-context.ts — what the user is looking at, sent along with each question.
//
// The assistant should explain the period and filters the page is actually
// showing, not guess, and it needs to know which page the user is on so it can
// either point at what is there or open the page that shows the answer. This
// reads both from the page address (the dashboard and forecast keep their filters
// there). Pure: no React, no DOM.
// ---------------------------------------------------------------------------

import { TOUR_PAGE_INFO, type TourPage } from "../tour/tour-labels";
import { tourPageFor } from "../tour/tour-script";

export interface ChatContext {
  /** The page open, or "other" for a page with nothing the assistant can point at. */
  page: TourPage | "other";
  /** First month on screen, as YYYYMM (dashboard only). Absent means the default (latest month). */
  periodStart?: string;
  periodEnd?: string;
  /** Business-unit (department) codes (dashboard and forecast). Empty means all. */
  units: string[];
  /** Branch codes (dashboard and forecast). Empty means all. */
  branches: string[];
}

/** Whether a page has a period filter. */
export const hasPeriod = (page: ChatContext["page"]) => page === "dashboard";
/** Whether a page has business-unit and branch filters. */
export const hasUnitFilters = (page: ChatContext["page"]) => page === "dashboard" || page === "forecast";

/** The context for the page the user is on. Pages the assistant cannot point at give page "other". */
export function readChatContext(pathname: string, search: string): ChatContext {
  const page = tourPageFor(pathname);
  if (!page) return { page: "other", units: [], branches: [] };

  const params = new URLSearchParams(search);
  const periodStart = hasPeriod(page) ? (params.get("periodStart") ?? params.get("period") ?? undefined) : undefined;
  const periodEnd = periodStart ? (params.get("periodEnd") ?? periodStart) : undefined;

  return {
    page,
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd } : {}),
    units: hasUnitFilters(page) ? params.getAll("unit").filter(Boolean) : [],
    branches: hasUnitFilters(page) ? params.getAll("branch").filter(Boolean) : [],
  };
}

/** The address that shows a scope: its page, with the filters that page keeps in the address. */
export function scopeToUrl(scope: ChatContext): string {
  if (scope.page === "other") return TOUR_PAGE_INFO.home.path;
  const path = TOUR_PAGE_INFO[scope.page].path;

  const params = new URLSearchParams();
  if (hasPeriod(scope.page) && scope.periodStart) {
    params.set("periodStart", scope.periodStart);
    params.set("periodEnd", scope.periodEnd ?? scope.periodStart);
  }
  if (hasUnitFilters(scope.page)) {
    for (const unit of scope.units) params.append("unit", unit);
    for (const branch of scope.branches) params.append("branch", branch);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
