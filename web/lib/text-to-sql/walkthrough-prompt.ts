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

const PANEL_GUIDE = `Dashboard panels you can point at (use these exact ids, in this top-to-bottom page order):
- filters (badge 1): the reporting scope controls: a month or date range, business units, branches. Everything on the dashboard follows them (the product-group and business-type revenue panels are the only ones that use the branch filter).
- comparison-source (badge 2): the "Compare against" dropdown. It chooses what the KPI cards, the revenue/expense chart, the profit chart and the profit and loss table are compared with: the previous month (default), the budget, an automatic (model) forecast or a manual forecast. This is the only place forecasts and budgets appear on the dashboard.
- kpi-cards (badge 3): the headline figures for ONE month (the last month of the selected range), each compared with the chosen comparison source: revenue, gross profit, net profit, margins, operating expense ratio, cost of sales, operating expenses and other income. A figure that breaches the user's threshold settings is flagged.
- anomalies (badge 4): "Anomalies to review", the unusual movements an ML model found for the selected months and business units, strongest first (shows the top 3, with a button for the rest). Not available when a branch is selected.
- profit-yoy (badge 5): net profit for the latest three months of the range against the same three months a year earlier, with the total change. It always compares with last year, whatever the comparison source.
- revenue-vs-expenses (badge 6): revenue and operating expenses side by side, month by month (a single selected month shows up to six months for context; a range shows every month in it). Operating expenses here do NOT include cost of sales.
- profit-margin (badge 7): profit as bars and margin % as a line, month by month, same months as the chart above. The user can switch between net and gross view. Shows the selected comparison source too.
- revenue-by-group (badge 8): how invoiced revenue splits across product groups for the period. It comes from invoices, not the ledger, so its total can differ from ledger revenue.
- revenue-by-business-type (badge 9): invoiced revenue split between the business types (Machining and Bulk) for the period. Also from invoices.
- expense-by-category (badge 10): operating expenses by expense account for the last month of the selected range, with the change against the previous calendar month.
- expense-by-business-type (badge 11): operating expenses split between Machining and Bulk, as a percentage mix with the total.
- profit-loss (badge 12): the full profit and loss statement: month actual, year to date, the comparison source's figure and the variance %, for the last month of the selected range.
There is NO panel for receivables, per-customer sales or invoice-level detail: never point at a panel for those. Forecasts and budgets are only visible through comparison-source (the panels it controls); there is no forecast chart.`;

const RULES = `Reply with JSON only, in this shape:
{ "reply": string, "walkthrough": { "opening": string, "steps": [ { "label": string, "explanation": string } ] } or null }

"reply" is the answer, written exactly as the guidelines above describe (Markdown allowed).

"walkthrough" lets the user SEE what you are explaining: the page highlights each panel, one at a time, while its explanation is shown. Rules:
- Set it to null when no panel helps: receivables, customers, invoice-level detail, refusals and clarifying questions. For anomaly questions point at "anomalies"; for forecast or budget questions point at "comparison-source" and the panel it changes, and tell the user to pick that source there.
- Use only ids from the list above, each at most once, in the order that tells the story. One step is fine. A broad question about the whole dashboard may use several, in page order, but keep it to the panels that matter (usually no more than six).
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
