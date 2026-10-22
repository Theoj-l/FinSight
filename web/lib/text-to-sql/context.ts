// ---------------------------------------------------------------------------
// context.ts — what the user is looking at, as received from the browser.
//
// The browser sends the page the user is on, and its period and filters, along
// with a question. It is untrusted input that ends up inside prompts, so only
// known shapes are kept: known pages, six-digit months and short alphanumeric
// codes. Anything else is dropped.
// Pure: no I/O.
// ---------------------------------------------------------------------------

import { hasPeriod, hasUnitFilters, type ChatContext } from "../../app/components/chat/chat-context";
import { isTourPage, TOUR_PAGE_INFO } from "../../app/components/tour/tour-labels";

export type { ChatContext };

const PERIOD = /^\d{6}$/;
const CODE = /^[A-Za-z0-9_-]{1,20}$/;
const MAX_CODES = 30;

const codes = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && CODE.test(item)).slice(0, MAX_CODES) : [];

/** A clean context, or null when there is none or its page is not one we know. */
export function parseChatContext(raw: unknown): ChatContext | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const page = input.page === "other" ? "other" : isTourPage(input.page) ? input.page : null;
  if (!page) return null;

  const start = hasPeriod(page) && typeof input.periodStart === "string" && PERIOD.test(input.periodStart) ? input.periodStart : undefined;
  const end = start ? (typeof input.periodEnd === "string" && PERIOD.test(input.periodEnd) ? input.periodEnd : start) : undefined;

  return {
    page,
    ...(start ? { periodStart: start } : {}),
    ...(end ? { periodEnd: end } : {}),
    units: hasUnitFilters(page) ? codes(input.units) : [],
    branches: hasUnitFilters(page) ? codes(input.branches) : [],
  };
}

const month = (period: string) => `${period.slice(0, 4)}-${period.slice(4)}`;

/** One plain sentence for a prompt: what the page is showing right now. */
export function describeContext(context: ChatContext): string {
  if (context.page === "other") return "The user is on a page of the app that has no charts or tables to point at (not the dashboard, forecast or home page).";

  const units = context.units.length ? context.units.join(", ") : "all business units";
  const branches = context.branches.length ? context.branches.join(", ") : "all branches";

  if (context.page === "dashboard") {
    const period = !context.periodStart
      ? "the newest month with data (no month chosen)"
      : context.periodStart === context.periodEnd
        ? month(context.periodStart)
        : `${month(context.periodStart)} to ${month(context.periodEnd ?? context.periodStart)}`;
    return `The user has the dashboard open, showing period ${period}, business units: ${units}, branches: ${branches}.`;
  }
  if (context.page === "forecast") {
    return `The user has the forecast page open, showing business units: ${units}, branches: ${branches} (it has no period filter: it always shows the closed months so far and the months ahead).`;
  }
  return "The user has the home page open (it has no filters: it shows the latest month for all business units).";
}

/** What the database actually contains, for checking a scope before the dashboard is moved to it. */
export interface ScopeOptions {
  periods: number[];
  units: string[];
  branches: string[];
}

/**
 * A scope proposed by the model, checked against real data. For the dashboard, months that
 * do not exist or run backwards make the whole scope invalid (null); unit and branch codes
 * that do not exist are dropped. The forecast page only has unit and branch filters, and the
 * home page has none. Null means "leave the page as it is".
 */
export function validateScope(scope: ChatContext | null, options: ScopeOptions): ChatContext | null {
  if (!scope || scope.page === "other") return null;
  const known = (values: string[], allowed: string[]) => values.filter((value) => allowed.includes(value));

  if (scope.page === "home") return { page: "home", units: [], branches: [] };
  if (scope.page === "forecast") return { page: "forecast", units: known(scope.units, options.units), branches: known(scope.branches, options.branches) };

  if (!scope.periodStart || !scope.periodEnd) return null;
  const periods = new Set(options.periods);
  const start = Number(scope.periodStart);
  const end = Number(scope.periodEnd);
  if (!periods.has(start) || !periods.has(end) || start > end) return null;

  return {
    page: "dashboard",
    periodStart: scope.periodStart,
    periodEnd: scope.periodEnd,
    units: known(scope.units, options.units),
    branches: known(scope.branches, options.branches),
  };
}

/** The address a scope opens, for prompts and logs. */
export const scopePath = (scope: ChatContext) => (scope.page === "other" ? TOUR_PAGE_INFO.home.path : TOUR_PAGE_INFO[scope.page].path);

/** Whether two scopes show the same thing: the same page, and on it the same period and filters. */
export function sameScope(a: ChatContext | null, b: ChatContext | null): boolean {
  if (!a || !b) return a === b;
  const key = (scope: ChatContext) =>
    JSON.stringify([
      scope.page,
      hasPeriod(scope.page) ? [scope.periodStart ?? "", scope.periodEnd ?? scope.periodStart ?? ""] : [],
      hasUnitFilters(scope.page) ? [[...scope.units].sort(), [...scope.branches].sort()] : [],
    ]);
  return key(a) === key(b);
}
