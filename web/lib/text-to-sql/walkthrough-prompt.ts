// ---------------------------------------------------------------------------
// walkthrough-prompt.ts — the system prompt for Call 2 when the user is on the
// dashboard: write the answer AND say which charts and tables to point at.
//
// It starts from the same answer guidelines as the plain pipeline (so the wording
// of answers stays comparable), then adds the walkthrough rules and what each
// dashboard panel shows. The panel ids are the ones the page labels with badges.
// ---------------------------------------------------------------------------

import { TOUR_LABELS } from "../../app/components/tour/tour-labels";
import { RESPONSE_GENERATION_PROMPT } from "../gemini/prompts/response-generation";
import { describeContext, type ChatContext } from "./context";

export const WALKTHROUGH_LABELS = Object.keys(TOUR_LABELS) as (keyof typeof TOUR_LABELS)[];

const PANEL_GUIDE = `Dashboard panels you can point at (use these exact ids):
- filters (badge 1): the reporting scope controls: a month or date range, business units, branches. Everything on the dashboard follows them.
- kpi-cards (badge 2): seven headline figures for ONE month (the last month of the selected range), each compared with the month before: revenue, gross profit, net profit, budget variance, gross margin, net margin, operating expense ratio.
- revenue-vs-expenses (badge 3): revenue and operating expenses side by side, month by month (a single selected month shows up to six months for context; a range shows every month in it). Operating expenses here do NOT include cost of sales.
- profit-margin (badge 4): net profit as bars and net margin % as a line, month by month, same months as the chart above.
- revenue-by-group (badge 5): how invoiced revenue splits across product groups for the period. It comes from invoices, not the ledger, so its total can differ from ledger revenue. The only panel that follows the branch filter.
- profit-loss (badge 6): the full profit and loss statement: month actual, year to date, the month's budget and variance %, for the last month of the selected range.
There is NO panel for receivables, per-customer sales, anomalies or forecasts: never point at a panel for those.`;

const RULES = `Reply with JSON only, in this shape:
{ "reply": string, "walkthrough": { "opening": string, "steps": [ { "label": string, "explanation": string } ] } or null }

"reply" is the answer, written exactly as the guidelines above describe (Markdown allowed).

"walkthrough" lets the user SEE what you are explaining: the page highlights each panel, one at a time, while its explanation is shown. Rules:
- Set it to null when no panel helps: receivables, customers, product-level or invoice-level detail, anomalies, forecasts, refusals and clarifying questions.
- Use only ids from the list above, each at most once, in the order that tells the story. One step is fine. A broad question about the whole dashboard may use all six.
- "explanation" is plain text, two or three sentences: say what that panel shows and how it supports the answer. Quote only figures that appear in the retrieved data. Do not repeat the whole reply.
- "opening" is one or two plain sentences leading into the steps.
- Check what the panels show. They show the period, business units and branches given in the dashboard context above. If the question is about something else, or the panels cannot show what it asks, say so in the explanation or use null. Never claim a panel shows a figure it does not.
- Do not return titles or badge numbers; the page adds them.`;

/**
 * The Call 2 system prompt for a user who has the dashboard open.
 * `moved` means the dashboard has just been set to this scope to match the question,
 * so the panels show the same period and units as the answer.
 */
export function buildWalkthroughSystemPrompt(context: ChatContext, moved = false): string {
  const state = moved
    ? `The dashboard has just been set to match the question: ${describeContext(context).replace("The user has the dashboard open, showing", "it now shows")} The panels therefore show the same period and business units as your answer, so a panel can be used to show a figure from the retrieved data when that figure is on it.`
    : describeContext(context);

  return `${RESPONSE_GENERATION_PROMPT}

# Pointing at the dashboard
${state}

${PANEL_GUIDE}

${RULES}`;
}
