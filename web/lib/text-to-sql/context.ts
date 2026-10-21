// ---------------------------------------------------------------------------
// context.ts — what the user is looking at, as received from the browser.
//
// The browser sends the dashboard's period and filters along with a question.
// It is untrusted input that ends up inside prompts, so only known shapes are
// kept: six-digit months and short alphanumeric codes. Anything else is dropped.
// Pure: no I/O.
// ---------------------------------------------------------------------------

import type { ChatContext } from "../../app/components/chat/chat-context";

export type { ChatContext };

const PERIOD = /^\d{6}$/;
const CODE = /^[A-Za-z0-9_-]{1,20}$/;
const MAX_CODES = 30;

const codes = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && CODE.test(item)).slice(0, MAX_CODES) : [];

/** A clean context, or null when there is none or it is not for the dashboard. */
export function parseChatContext(raw: unknown): ChatContext | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  if (input.page !== "dashboard") return null;

  const start = typeof input.periodStart === "string" && PERIOD.test(input.periodStart) ? input.periodStart : undefined;
  const end = typeof input.periodEnd === "string" && PERIOD.test(input.periodEnd) ? input.periodEnd : start;

  return {
    page: "dashboard",
    ...(start ? { periodStart: start } : {}),
    ...(end ? { periodEnd: end } : {}),
    units: codes(input.units),
    branches: codes(input.branches),
  };
}

const month = (period: string) => `${period.slice(0, 4)}-${period.slice(4)}`;

/** One plain sentence for a prompt: what the dashboard is showing right now. */
export function describeContext(context: ChatContext): string {
  const period = !context.periodStart
    ? "the newest month with data (no month chosen)"
    : context.periodStart === context.periodEnd
      ? month(context.periodStart)
      : `${month(context.periodStart)} to ${month(context.periodEnd ?? context.periodStart)}`;
  const units = context.units.length ? context.units.join(", ") : "all business units";
  const branches = context.branches.length ? context.branches.join(", ") : "all branches";
  return `The user has the dashboard open, showing period ${period}, business units: ${units}, branches: ${branches}.`;
}
