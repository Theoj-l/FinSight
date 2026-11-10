// ---------------------------------------------------------------------------
// walkthrough.ts — walkthroughs for the fixed-function chat method (/api/chat).
//
// The classifier does not name a page, so the page comes from its question type:
// forecast questions go to the forecast page, everything else to the dashboard (or
// stays on the home page when that is where the user asked). Its period ("2026-06",
// "2026-Q2") and department filter set the dashboard's month and units when they are
// real ones. The answer and walkthrough are then written by the same writer the
// Direct SQL method uses, so both methods point at the panels in the same way.
// ---------------------------------------------------------------------------

import type { TourScript } from "../../app/components/tour/tour-script";
import type { RetrievalResult } from "../data-retrieval/types";
import { writeWalkthroughAnswer } from "../text-to-sql/answer";
import type { ChatContext } from "../text-to-sql/context";
import { resolveTarget } from "../text-to-sql/pipeline";
import { getScopeOptions } from "../text-to-sql/service";
import type { ClassificationResult } from "../types/classification";
import { responseContents } from "./response-generator";

const FORECAST_TYPES = new Set(["forecast_retrieval", "forecast_action"]);
const CODE = /^[A-Za-z0-9_-]{1,20}$/;

/** "2026-06" -> one month; "2026-Q2" -> its three months; anything relative -> none. */
export function periodRange(period: string | null): { periodStart: string; periodEnd: string } | null {
  if (!period) return null;
  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month) return { periodStart: `${month[1]}${month[2]}`, periodEnd: `${month[1]}${month[2]}` };
  const quarter = /^(\d{4})-Q([1-4])$/i.exec(period);
  if (quarter) {
    const first = (Number(quarter[2]) - 1) * 3 + 1;
    const pad = (n: number) => String(n).padStart(2, "0");
    return { periodStart: `${quarter[1]}${pad(first)}`, periodEnd: `${quarter[1]}${pad(first + 2)}` };
  }
  return null;
}

/** The page, and its settings, that would show what a classified question is about. */
export function classicScope(classification: ClassificationResult, current: ChatContext): ChatContext {
  const department = classification.filters?.department;
  const units = department && CODE.test(department) ? [department] : [];

  if (FORECAST_TYPES.has(classification.question_type)) return { page: "forecast", units, branches: [] };
  if (current.page === "home" && !classification.period && units.length === 0) return { page: "home", units: [], branches: [] };

  const range = periodRange(classification.period);
  if (range) return { page: "dashboard", ...range, units, branches: [] };
  // No exact month: keep the dashboard's own period when it is open, else open it on its default.
  return current.page === "dashboard"
    ? { ...current, units: units.length ? units : current.units }
    : { page: "dashboard", units, branches: [] };
}

/**
 * Write the fixed-function answer together with a walkthrough. `scope` is the page and
 * settings it is written for; it is null (and the page is left alone) without a walkthrough.
 */
export async function answerClassicWithWalkthrough(
  question: string,
  classification: ClassificationResult,
  data: RetrievalResult,
  context: ChatContext,
): Promise<{ reply: string; walkthrough: TourScript | null; scope: ChatContext | null }> {
  // Without the list of real months and units, the dashboard's period is simply not changed.
  const options = await getScopeOptions().catch(() => undefined);
  const { target, moved } = resolveTarget(classicScope(classification, context), context, options);
  if (!target) return { reply: "", walkthrough: null, scope: null };

  const written = await writeWalkthroughAnswer(responseContents(question, classification, data), target, moved);
  return { reply: written.reply, walkthrough: written.walkthrough, scope: written.walkthrough ? target : null };
}
