// ---------------------------------------------------------------------------
// walkthrough-prompt.ts — the system prompt for Call 2 when the user is in the
// app: write the answer AND say which charts and tables to point at.
//
// A walkthrough is for one page (the dashboard, the forecast page or the home page).
// The prompt starts from the same answer guidelines as the plain pipeline (so the
// wording of answers stays comparable), then adds the walkthrough rules and what
// each panel of the target page shows. The panel ids are the ones the page labels
// with badges.
// ---------------------------------------------------------------------------

import { labelsForPage, TOUR_PAGE_INFO, type TourLabelId, type TourPage } from "../../app/components/tour/tour-labels";
import { RESPONSE_GENERATION_PROMPT } from "../gemini/prompts/response-generation";
import { describeContext, type ChatContext } from "./context";

/** The panel ids the model may use for a page. */
export const walkthroughLabels = (page: TourPage): TourLabelId[] => labelsForPage(page);

const PANEL_GUIDES: Record<TourPage, string> = {
  dashboard: `Dashboard panels you can point at (use these exact ids, in this top-to-bottom page order):
- filters (badge 1): the reporting scope controls: a month or date range, business units, branches. Everything on the dashboard follows them (the product-group and business-type revenue panels are the only ones that use the branch filter).
- comparison-source (badge 2): the "Compare against" dropdown. It chooses what the KPI cards, the revenue/expense chart, the profit chart and the profit and loss table are compared with: the previous month (default), the budget, an automatic (model) forecast or a manual forecast. This is the only place forecasts and budgets appear on the dashboard.
- kpi-cards (badge 3): the headline figures for ONE month (the last month of the selected range), each compared with the chosen comparison source: revenue, gross profit, net profit, margins, operating expense ratio, cost of sales, operating expenses and other income. A figure that breaches the user's threshold settings is flagged.
- anomalies (badge 4): "Anomalies to review", the unusual movements an ML model found for the selected months and business units, strongest first (shows the top 3, with a button for the rest). Not available when a branch is selected.
- profit-yoy (badge 5): net profit for the latest three months of the range against the same three months a year earlier, with the total change. It always compares with last year, whatever the comparison source.
- revenue-vs-expenses (badge 6): revenue and operating expenses side by side, month by month (a single selected month shows up to six months for context; a range shows every month in it). Operating expenses here do NOT include cost of sales.
- profit-margin (badge 7): profit as bars and margin % as a line, month by month, same months as the chart above. It opens in NET view; only mention gross profit or gross margin there if you tell the user to switch the view to gross. Shows the selected comparison source too.
- revenue-by-group (badge 8): how invoiced revenue splits across product groups for the period. It comes from invoices, not the ledger, so its total can differ from ledger revenue.
- revenue-by-business-type (badge 9): invoiced revenue split between the business types (Machining and Bulk) for the period. Also from invoices.
- expense-by-category (badge 10): operating expenses by expense account for the last month of the selected range, with the change against the previous calendar month.
- expense-by-business-type (badge 11): operating expenses split between Machining and Bulk, as a percentage mix with the total.
- profit-loss (badge 12): the full profit and loss statement: month actual, year to date, the comparison source's figure and the variance %, for the last month of the selected range.
There is NO panel for receivables, per-customer sales or invoice-level detail: never point at a panel for those. For anomaly questions point at "anomalies". Budgets are only visible through comparison-source (the panels it controls). Forecasts have their own page, not a panel here.`,

  forecast: `Forecast page panels you can point at (use these exact ids, in this top-to-bottom page order):
- forecast-filters (badge 1): business units and branches. There is no period filter: forecasts always start after the latest closed month. Branches are not supported here (ledger figures cannot be split by branch).
- forecast-metric (badge 2): a switch between revenue, cost and net profit. It opens on profit; tell the user to switch it when the question is about revenue or cost.
- forecast-summary (badge 3): three cards for the chosen metric: the projection for next month, the latest closed actual, and the movement between them (amount and %).
- forecast-chart (badge 4): a line chart of the chosen metric: the solid navy line is closed-month actuals, the dashed blue line is earlier one-month-ahead projections, the dashed red line is the future projections, the shaded band is the typical range of outcomes, and a vertical line marks where the forecast begins.
- forecast-horizon (badge 5): a table of the monthly projections for the chosen metric: month, projection, typical range (low to high) and how many months ahead.
The forecast covers revenue, cost and net profit only, for the months after the newest month of data. There is no forecast by product group, customer or expense category, and projections are estimates, not guarantees: say so when you quote them.`,

  home: `Home page panels you can point at (use these exact ids, in this top-to-bottom page order):
- home-snapshot (badge 1): the "Financial snapshot": the headline figures for the latest reporting month for all business units, each compared with the previous month.
- home-attention (badge 2): "Needs your attention": the latest anomaly alerts and the figures that crossed the user's threshold settings.
The home page is a quick overview: for anything more detailed, the dashboard is the better page.`,
};

const RULES = `Reply with JSON only, in this shape:
{ "reply": string, "walkthrough": { "opening": string, "steps": [ { "label": string, "explanation": string } ] } or null }

"reply" is the answer, written exactly as the guidelines above describe (Markdown allowed).

"walkthrough" lets the user SEE what you are explaining: the page highlights each panel, one at a time, while its explanation is shown. Rules:
- Set it to null when no panel on this page helps: receivables, customers, invoice-level detail, refusals and clarifying questions.
- Use only ids from the list above (they all belong to this one page), each at most once, in the order that tells the story. One step is fine. A broad question about the whole page may use several, in page order, but keep it to the panels that matter (usually no more than six).
- "explanation" is plain text, two or three sentences, and it answers the user's QUESTION as seen on that panel. Start with what this panel shows about the question: the actual figure, change or comparison from the retrieved data (for example "Revenue was 6.03M against operating expenses of 0.85M in August 2026"). Then say where to look on the panel (for example "compare the two August bars"). Never describe the chart in general ("This chart plots…", "This panel shows…"): the user can see what it is and the card already shows its title. Every step must say something different, and something this question needs.
- Quote only figures that appear in the retrieved data, copied exactly as the reply gives them. If a panel shows more than the retrieved data covers (other months, other categories), say what to look at in words ("the bars to the left show the earlier months") without inventing figures. If you cannot tie a panel to the question with something from the data, leave that panel out.
- Use "filters" only when the dashboard was just moved to match the question, or the question is about the period or units themselves; then say which month and units it now shows. Otherwise leave it out: it adds nothing. For "comparison-source", say which source to pick and what it will show for this question.
- A table or chart step must name a specific line or bar to look at and its value (for example "the Net profit row shows 912,102.66 against 849,295.20 last month"), never just say it "details" or "shows" the figures.
- Do not repeat the whole reply in the steps; each step adds where to see one part of it.
- "opening" is one or two plain sentences that state the answer in brief and lead into the steps.
- Check what the panels show. They show the period, business units and branches given in the dashboard context above. If the question is about something else, or the panels cannot show what it asks, say so in the explanation or use null. Never claim a panel shows a figure it does not.
- Do not return titles or badge numbers; the page adds them.`;

/**
 * The Call 2 system prompt for a walkthrough on `context.page`.
 * `moved` means the app has just opened that page, or set its filters, to match the
 * question, so the panels show the same period and units as the answer.
 */
export function buildWalkthroughSystemPrompt(context: ChatContext & { page: TourPage }, moved = false): string {
  const state = moved
    ? `${describeContext(context)} The page was just opened or set to match the question, so its panels show the same period and business units as your answer, and a panel can be used to show a figure from the retrieved data when that figure is on it.`
    : describeContext(context);

  return `${RESPONSE_GENERATION_PROMPT}

# Pointing at the app
${state}
The walkthrough is for the ${TOUR_PAGE_INFO[context.page].name}: call it that in the steps, and never call it another page's name (for example, do not call the forecast page "the dashboard").

${PANEL_GUIDES[context.page]}

${RULES}`;
}
