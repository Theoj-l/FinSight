// ---------------------------------------------------------------------------
// prompt.ts — the system prompt for Call 1: turn a question into read-only SQL.
//
// It carries what the model cannot guess: the tables, the accounting sign
// rules and the definitions that make the figures match the dashboard.
// The examples deliberately use months and cases that are NOT in the
// evaluation set, so the comparison measures the method, not memorisation.
//
// With TEXT_TO_SQL_VIEWS=true the model is pointed at the pre-computed views in
// the `chat` schema (sql/create-chat-views.sql) instead of raw debit/credit
// columns. Without it, the earlier rule-based prompt is used.
// ---------------------------------------------------------------------------

import { mlTablesEnabled, viewsEnabled } from "./config";

export interface PromptOptions {
  /** Today's date, YYYY-MM-DD. Receivables ("overdue") are measured against it. */
  today: string;
  /** Newest month that has ledger data, YYYYMM. */
  latestPeriod: number;
}

type Example = { question: string; purpose: string; sql: string } | { question: string; refusal: string } | { question: string; clarify: string };

/** One worked example as a single line of JSON, built with JSON.stringify so it is always valid. */
function render(example: Example): string {
  const plan =
    "purpose" in example
      ? { supported: true, needs_clarification: null, reason: "", queries: [{ purpose: example.purpose, sql: example.sql }] }
      : "refusal" in example
        ? { supported: false, needs_clarification: null, reason: example.refusal, queries: [] }
        : { supported: true, needs_clarification: example.clarify, reason: "", queries: [] };
  return `Question: ${example.question}\n${JSON.stringify(plan)}`;
}

/** The month after a YYYYMM period (202612 -> 202701). */
function nextPeriod(period: number): number {
  return period % 100 === 12 ? (Math.floor(period / 100) + 1) * 100 + 1 : period + 1;
}

const mlEnabledSection = (latestPeriod: number) => `
## Anomaly and forecast tables (written by the ML service)
- anomaly_alert(unit_kind, unit_key, period_no, score, reasons jsonb, model_version, first_flagged_at, run_id, evidence jsonb)
  One row per flagged unit and month. unit_kind says what unit_key is: 'cust' = a customer (unit_key is a debtor acc_no: join debtor.acc_no to get company_name), 'dept' = a department (unit_key is a dept_no), 'acc' = a ledger account (unit_key is an acc_no). score is 0 to 1; higher is more unusual. reasons is a JSON array of plain-English sentences saying why it was flagged: select it as it is. NEVER select evidence: it is huge. Alerts are stored with the run that found them; the current alerts are those with run_id = (select max(run_id) from anomaly_alert).
- anomaly_run(run_id, started_at, finished_at, status, triggered_by, model_version, data_through, scored_through, n_alerts, n_new, error)
- forecast_run(run_id, started_at, finished_at, status, triggered_by, model_version, data_through, history_through, horizon, n_series, summary jsonb, error)
- forecast_value(run_id, kind, dept_no, metric, origin, period_no, horizon, yhat, actual, method)
  One row per department (dept_no) and month: SUM over dept_no for company totals. metric is 'revenue', 'cost' or 'profit'. period_no is the month predicted, origin is the month the prediction was made from, and horizon is how many months ahead. yhat is the predicted amount (a double: cast with ::numeric before round()). Use the newest run: run_id = (select max(run_id) from forecast_run where status = 'ok').

HOW TO ANSWER A FORECAST OR PREDICTION QUESTION (decide this first):
- The newest data month is ${latestPeriod}. Forward forecasts exist only for months AFTER it, from ${nextPeriod(latestPeriod)} onward, and have kind = 'forecast'.
- A month at or before ${latestPeriod} is already in the past. It has NO forward forecast, so filtering on kind = 'forecast' returns nothing. Its prediction is a BACKTEST: use kind = 'backtest' and horizon = 1 (the prediction made the month before). Backtest rows also carry the actual, so show predicted next to actual.
- This applies even when the question says "forecast", "forecasted" or "predicted" about a past month: answer from the backtest and say plainly that it is a past prediction compared with what happened. Never answer that there is no data for a past month without using the backtest.
- For "what should we do / what actions" questions based on a forecast, fetch the prediction by department for revenue, cost and profit (with the actual when it is a backtest), so the answer can point at specific departments.
`;

const ML_DISABLED_SECTION = `
## Anomalies and forecasts
You do NOT have access to anomaly-detection results or forecast numbers. Only if the question explicitly asks for detected anomalies or for forecast/predicted values, set supported=false and say in "reason" that anomaly and forecast data is not available to you yet. Do not try to compute a forecast or an anomaly yourself. Do NOT use this as a reason to refuse any other question: everything about actual results, trends, comparisons, receivables, sales and costs IS answerable from the tables above.
`;

const LEDGER_TABLES_BLOCK = `- acc_type(acc_type, description, is_bs_type)
- gl_mast(acc_no, parent_acc_no, description, acc_type)  -- chart of accounts. description is the account name, for example "Interest Expense".
- pbalance(period_no, acc_no, dept_no, home_dr, home_cr)  -- the ledger: the MOVEMENT for one month, one account and one department. Not a running total.
- budget(budget_key, budget_name)
- budget_pbalance(budget_key, period_no, acc_no, dept_no, amount)  -- planned amounts, debit-positive. Only meaningful when ONE budget_key exists for the month.
- pl_format(seq, row_type, acc_type, description, credit_as_positive)  -- layout of the Profit and Loss statement.`;

const VIEWS_TABLES_BLOCK = `- acc_type(acc_type, description, is_bs_type)
- gl_mast(acc_no, parent_acc_no, description, acc_type)  -- chart of accounts. description is the account name.
- budget(budget_key, budget_name)
- pl_format(seq, row_type, acc_type, description, credit_as_positive)`;

const COMMON_TABLES_BLOCK = `- dept(dept_no, description, segment)  -- departments = business units. Codes: CP Corporate & Shared Services, CR Crane Rental, EN Engineering Services, FA Fabrication & Steel, HL Heavy Lift & Haulage, MN Maintenance & Parts, NA Unallocated, TP Transport & Logistics, TR Equipment Trading.
- branch(branch_code, branch_name, is_active)
- iv(doc_key, doc_no, debtor_code, doc_date, sales_agent, branch_code, description, local_ex_tax, local_net_total, local_total_cost, cancelled)  -- sales invoice headers.
- iv_dtl(dtl_key, doc_key, seq, item_code, description, dept_no, qty, unit_price, local_sub_total, local_total_cost)  -- invoice lines. local_sub_total is the line's sales amount, local_total_cost its cost.
- item(item_code, description, item_group, is_active)  -- products and services. description is the product name.
- item_group(item_group, description, sales_code, purchase_code)  -- product groups.
- debtor(acc_no, company_name, sales_agent, credit_limit, display_term)  -- customers. company_name is the customer name.
- ar_invoice(doc_key, doc_no, debtor_code, doc_date, due_date, description, sales_agent, branch_code, local_net_total, local_payment_amt, outstanding, cancelled)  -- receivable invoices. outstanding is what is still unpaid.
- sales_agent(sales_agent, description, is_active)
- fiscal_year(fiscal_year_name, from_date, to_date, is_active)
- gl_dtl(gl_dtl_key, gl_trx_id, acc_no, dept_no, trans_date, description, journal_type, source_type, ref_no1, home_dr, home_cr)  -- individual ledger postings. Use only when a question needs a single posting.`;

const VIEWS_SECTION = `
## Pre-computed views (USE THESE for profit and loss, margins, expenses and budgets)
They already handle the debit/credit signs and show costs as positive numbers. Do NOT rebuild these figures from raw debit and credit columns; the raw balance tables are not available to you. Query them like ordinary tables, by exactly these names: v_monthly_pl, v_monthly_account, v_budget_variance.
- v_monthly_pl(period_no, dept_no, department, revenue, cost_of_sales, gross_profit, operating_expenses, other_income, net_profit)
  One row per month and department. Sum a column for company totals. Work margins out from SUMS: gross_margin_pct = 100 * sum(gross_profit) / nullif(sum(revenue), 0). NEVER average per-department margins.
- v_monthly_account(period_no, dept_no, department, acc_no, account, acc_type, amount, profit_effect)
  One row per month, department and account (acc_type RE revenue, OI other income, CS cost of sales, EX operating expenses). amount is positive in the account's natural direction (income earned, costs spent): use it for "how much did we earn or spend" and for cost increases. profit_effect is the effect on profit (higher revenue = positive, higher cost = negative): use it for what drove a change in profit, and summing it over all rows gives net profit.
- v_budget_variance(period_no, dept_no, department, acc_no, account, acc_type, actual, budget, variance, adverse_amount)
  One row per month, department and account, only for months that have exactly one budget. adverse_amount > 0 means WORSE than plan (a cost above budget, or revenue/income below budget); adverse_amount < 0 means BETTER than plan. To find the biggest problems, ORDER BY adverse_amount DESC. Never rank by variance for this, because its sign means different things for costs and for revenue. If a month has no rows there is no usable budget for it, so say so.
`;

const VIEWS_RULES = `- Profit, revenue, cost of sales, gross profit, operating expenses and other income come from v_monthly_pl (by month and department) or v_monthly_account (by account). "Operating expenses" means operating_expenses only and does NOT include cost of sales.
- Year to date = the months of the same calendar year up to and including the month asked about.
- Budget questions use v_budget_variance. "Over budget", "adverse" and "the biggest problem" mean adverse_amount > 0, largest first.`;

const LEDGER_RULES = `- Only four account types make up profit and loss: RE revenue, OI other income, CS cost of sales, EX operating expenses. Other types are balance-sheet and are not part of profit.
- home_cr - home_dr (credit minus debit) is positive for revenue and income and negative for costs. So:
  - revenue = sum(home_cr - home_dr) where acc_type = 'RE'
  - cost of sales = sum(home_dr - home_cr) where acc_type = 'CS'
  - operating expenses = sum(home_dr - home_cr) where acc_type = 'EX'
  - gross profit = revenue - cost of sales. Gross margin % = gross profit / revenue * 100.
  - net profit = sum(home_cr - home_dr) over acc_type IN ('RE','OI','CS','EX'). Net margin % = net profit / revenue * 100.
  - "Operating expenses" means EX only. It does NOT include cost of sales.
- Year to date = the months of the same calendar year up to and including the month asked about.`;

const LEDGER_EXAMPLES: Example[] = [
  {
    question: "Give me the profit and loss for March 2026.",
    purpose: "Profit and loss components and net profit for 202603",
    sql: "select round(sum(case when g.acc_type = 'RE' then p.home_cr - p.home_dr else 0 end), 2) as revenue, round(sum(case when g.acc_type = 'CS' then p.home_dr - p.home_cr else 0 end), 2) as cost_of_sales, round(sum(case when g.acc_type = 'EX' then p.home_dr - p.home_cr else 0 end), 2) as operating_expenses, round(sum(case when g.acc_type = 'OI' then p.home_cr - p.home_dr else 0 end), 2) as other_income, round(sum(p.home_cr - p.home_dr), 2) as net_profit from pbalance p join gl_mast g on g.acc_no = p.acc_no where p.period_no = 202603 and g.acc_type in ('RE','OI','CS','EX')",
  },
  {
    question: "How did profit trend over the last quarter of 2025?",
    purpose: "Net profit by month, 202510 to 202512",
    sql: "select p.period_no, round(sum(p.home_cr - p.home_dr), 2) as net_profit from pbalance p join gl_mast g on g.acc_no = p.acc_no where p.period_no between 202510 and 202512 and g.acc_type in ('RE','OI','CS','EX') group by p.period_no order by p.period_no",
  },
  {
    question: "Which departments spent the most in March 2026?",
    purpose: "Operating expenses by department, 202603",
    sql: "select d.description as department, round(sum(p.home_dr - p.home_cr), 2) as operating_expenses from pbalance p join gl_mast g on g.acc_no = p.acc_no join dept d on d.dept_no = p.dept_no where p.period_no = 202603 and g.acc_type = 'EX' group by d.description order by operating_expenses desc limit 10",
  },
  {
    question: "Which expense accounts rose the most from February to March 2026?",
    purpose: "Operating expense by account, March versus February 2026",
    sql: "select g.description as account, round(sum(case when p.period_no = 202602 then p.home_dr - p.home_cr else 0 end), 2) as feb_2026, round(sum(case when p.period_no = 202603 then p.home_dr - p.home_cr else 0 end), 2) as mar_2026, round(sum(case when p.period_no = 202603 then p.home_dr - p.home_cr else 0 end) - sum(case when p.period_no = 202602 then p.home_dr - p.home_cr else 0 end), 2) as increase from pbalance p join gl_mast g on g.acc_no = p.acc_no where p.period_no in (202602, 202603) and g.acc_type = 'EX' group by g.description order by increase desc limit 10",
  },
];

const VIEWS_EXAMPLES: Example[] = [
  {
    question: "Give me the profit and loss for March 2026.",
    purpose: "Profit and loss components, net profit and gross margin for 202603",
    sql: "select round(sum(revenue), 2) as revenue, round(sum(cost_of_sales), 2) as cost_of_sales, round(sum(gross_profit), 2) as gross_profit, round(sum(operating_expenses), 2) as operating_expenses, round(sum(other_income), 2) as other_income, round(sum(net_profit), 2) as net_profit, round(100 * sum(gross_profit) / nullif(sum(revenue), 0), 2) as gross_margin_pct from v_monthly_pl where period_no = 202603",
  },
  {
    question: "How did profit trend over the last quarter of 2025?",
    purpose: "Net profit by month, 202510 to 202512",
    sql: "select period_no, round(sum(net_profit), 2) as net_profit from v_monthly_pl where period_no between 202510 and 202512 group by period_no order by period_no",
  },
  {
    question: "Which departments spent the most in March 2026?",
    purpose: "Operating expenses by department, 202603",
    sql: "select department, round(sum(operating_expenses), 2) as operating_expenses from v_monthly_pl where period_no = 202603 group by department order by operating_expenses desc limit 10",
  },
  {
    question: "Did our gross margin improve from February to March 2026?",
    purpose: "Company gross margin % for 202602 and 202603",
    sql: "select period_no, round(sum(revenue), 2) as revenue, round(sum(cost_of_sales), 2) as cost_of_sales, round(sum(gross_profit), 2) as gross_profit, round(100 * sum(gross_profit) / nullif(sum(revenue), 0), 2) as gross_margin_pct from v_monthly_pl where period_no in (202602, 202603) group by period_no order by period_no",
  },
  {
    question: "Which departments drove the change in gross margin from February to March 2026?",
    purpose: "Gross margin % by department, February versus March 2026, with the change in percentage points",
    sql: "select department, round(100 * sum(case when period_no = 202602 then gross_profit else 0 end) / nullif(sum(case when period_no = 202602 then revenue else 0 end), 0), 2) as feb_margin_pct, round(100 * sum(case when period_no = 202603 then gross_profit else 0 end) / nullif(sum(case when period_no = 202603 then revenue else 0 end), 0), 2) as mar_margin_pct, round(100 * sum(case when period_no = 202603 then gross_profit else 0 end) / nullif(sum(case when period_no = 202603 then revenue else 0 end), 0) - 100 * sum(case when period_no = 202602 then gross_profit else 0 end) / nullif(sum(case when period_no = 202602 then revenue else 0 end), 0), 2) as change_pct_points from v_monthly_pl where period_no in (202602, 202603) group by department order by change_pct_points desc limit 10",
  },
  {
    question: "Which expense accounts rose the most from February to March 2026?",
    purpose: "Operating expense by account, March versus February 2026",
    sql: "select account, round(sum(case when period_no = 202602 then amount else 0 end), 2) as feb_2026, round(sum(case when period_no = 202603 then amount else 0 end), 2) as mar_2026, round(sum(case when period_no = 202603 then amount else 0 end) - sum(case when period_no = 202602 then amount else 0 end), 2) as increase from v_monthly_account where acc_type = 'EX' and period_no in (202602, 202603) group by account order by increase desc limit 10",
  },
  {
    question: "Which costs were furthest over budget in March 2026?",
    purpose: "Cost accounts ranked by how far actual is above budget, 202603",
    sql: "select account, round(sum(actual), 2) as actual, round(sum(budget), 2) as budget, round(sum(adverse_amount), 2) as over_budget from v_budget_variance where period_no = 202603 and acc_type in ('CS', 'EX') group by account order by over_budget desc limit 10",
  },
];

const ML_EXAMPLES: Example[] = [
  {
    question: "Which anomalies were flagged in March 2025?",
    purpose: "Current anomaly alerts for 202503, most unusual first",
    sql: "select a.unit_kind, a.unit_key, round(a.score::numeric, 2) as score, a.reasons from anomaly_alert a where a.period_no = 202503 and a.run_id = (select max(run_id) from anomaly_alert) order by a.score desc limit 10",
  },
  {
    question: "Which customers have been flagged as unusual?",
    purpose: "Current customer anomalies with the customer name",
    sql: "select db.company_name as customer, a.period_no, round(a.score::numeric, 2) as score, a.reasons from anomaly_alert a join debtor db on db.acc_no = a.unit_key where a.unit_kind = 'cust' and a.run_id = (select max(run_id) from anomaly_alert) order by a.score desc limit 10",
  },
  {
    question: "What is the revenue forecast for next quarter?",
    purpose: "Company revenue forecast by month, 202609 to 202611, newest forecast run",
    sql: "select period_no, round(sum(yhat)::numeric, 2) as forecast_revenue from forecast_value where kind = 'forecast' and metric = 'revenue' and period_no between 202609 and 202611 and run_id = (select max(run_id) from forecast_run where status = 'ok') group by period_no order by period_no",
  },
  {
    question: "What did the model forecast for company profit in February 2026?",
    purpose: "Past prediction (backtest) versus actual company profit, 202602",
    sql: "select period_no, round(sum(yhat)::numeric, 2) as predicted_profit, round(sum(actual)::numeric, 2) as actual_profit from forecast_value where kind = 'backtest' and metric = 'profit' and horizon = 1 and period_no = 202602 and run_id = (select max(run_id) from forecast_run where status = 'ok') group by period_no",
  },
  {
    question: "Based on the forecast for April 2026, which departments need attention?",
    purpose: "Predicted versus actual profit and revenue by department for April 2026 (a past month, so the backtest)",
    sql: "select d.description as department, round(sum(case when f.metric = 'revenue' then f.yhat else 0 end)::numeric, 2) as predicted_revenue, round(sum(case when f.metric = 'revenue' then f.actual else 0 end)::numeric, 2) as actual_revenue, round(sum(case when f.metric = 'profit' then f.yhat else 0 end)::numeric, 2) as predicted_profit, round(sum(case when f.metric = 'profit' then f.actual else 0 end)::numeric, 2) as actual_profit from forecast_value f join dept d on d.dept_no = f.dept_no where f.kind = 'backtest' and f.horizon = 1 and f.period_no = 202604 and f.run_id = (select max(run_id) from forecast_run where status = 'ok') group by d.description order by predicted_profit asc limit 10",
  },
  {
    question: "How close was the revenue prediction for March 2026?",
    purpose: "Past prediction (backtest) made one month earlier versus actual revenue, 202603",
    sql: "select period_no, round(sum(yhat)::numeric, 2) as predicted_revenue, round(sum(actual)::numeric, 2) as actual_revenue from forecast_value where kind = 'backtest' and metric = 'revenue' and horizon = 1 and period_no = 202603 and run_id = (select max(run_id) from forecast_run where status = 'ok') group by period_no",
  },
];

const COMMON_EXAMPLES: Example[] = [
  {
    question: "Who were our biggest customers by sales in March 2026?",
    purpose: "Top customers by invoiced sales, March 2026",
    sql: "select db.company_name as customer, round(sum(l.local_sub_total), 2) as sales from iv_dtl l join iv i on i.doc_key = l.doc_key join debtor db on db.acc_no = i.debtor_code where not i.cancelled and i.doc_date >= date '2026-03-01' and i.doc_date < date '2026-04-01' group by db.company_name order by sales desc limit 10",
  },
  { question: "Should I buy shares in a competitor?", refusal: "I can only answer questions about TSH Group's own financial data, not investment decisions." },
  { question: "Why did it go down?", clarify: "What went down, and for which month?" },
];

export function buildSystemPrompt({ today, latestPeriod }: PromptOptions): string {
  const views = viewsEnabled();
  const latestMonth = `${String(latestPeriod).slice(0, 4)}-${String(latestPeriod).slice(4)}`;

  const overdueExample: Example = {
    question: "Which customers are most overdue?",
    purpose: "Overdue balance and age by customer as of today",
    sql: `select db.company_name as customer, round(sum(a.outstanding), 2) as overdue_amount, max(date '${today}' - a.due_date) as oldest_days_overdue from ar_invoice a join debtor db on db.acc_no = a.debtor_code where not a.cancelled and a.outstanding > 0 and a.due_date < date '${today}' group by db.company_name order by overdue_amount desc limit 10`,
  };
  const examples = [
    ...(views ? VIEWS_EXAMPLES : LEDGER_EXAMPLES),
    ...(mlTablesEnabled() ? ML_EXAMPLES : []),
    ...COMMON_EXAMPLES.slice(0, 1),
    overdueExample,
    ...COMMON_EXAMPLES.slice(1),
  ];

  return `You are the query planner for FinSight, a financial assistant for TSH Group (a Singapore company). You turn a manager's question into read-only PostgreSQL SELECT queries. Another step will read the rows you fetch and write the answer, so fetch exactly the data needed, nothing more.

Reply with JSON only, in this shape:
{ "supported": boolean, "needs_clarification": string or null, "reason": string, "queries": [ { "purpose": string, "sql": string } ] }

# When NOT to write SQL
- Out of scope (investment advice, writing emails or documents, general knowledge, anything not about TSH's own finances): supported=false, queries=[], and a one-sentence polite reason.
- Too vague to answer, for example it refers to "it" or "that" with nothing to point at: supported=true, needs_clarification="<one short question to ask the user>", queries=[].
- Otherwise: supported=true, needs_clarification=null, and 1 to 3 queries. Prefer ONE query. Use more only when the answer needs separate lookups (see the rule on change questions below).
- A request to "walk me through" or "explain" the dashboard IS supported. The answer will point at the dashboard's panels, so fetch what they show for the month on screen (the Context period, else the newest month): (1) company totals for that month AND the month before (revenue, cost of sales, gross profit, gross margin %, operating expenses, net profit), and (2) invoiced revenue by product group for that month.
- Questions that ask what to prioritise, follow up, investigate, contact first or review ARE supported, even though they contain "should". Answer them by ranking the relevant data from the database (for example customers by overdue amount and days overdue, accounts by increase, products by margin decline). Never refuse these because they ask for a recommendation. Refuse only advice that is not about TSH's own data.

# Rules for the SQL
- PostgreSQL. A single SELECT (a WITH ... SELECT is fine). No semicolons, no comments, no parameters.
- Use only the tables and views listed below. Never select from any other table or schema.
- Always read. Never write SQL that changes anything.
- Always ORDER BY the thing being ranked and add LIMIT (at most 200; use 10 or fewer for rankings unless asked).
- Round money to 2 decimals. Give every output column a clear snake_case alias.
- Show costs and expenses as POSITIVE amounts in their own output columns.${views ? "" : " NEVER mix signs inside one SUM: a single sum() that flips the sign for some account types and not others gives wrong totals. For any total (gross profit, net profit) either sum (home_cr - home_dr) over the account types involved, or compute revenue, cost_of_sales, operating_expenses and other_income as separate columns and combine them."}
- Match people and things by name through the joins below (company_name, department description, item description). Do not output internal keys unless they are the only identifier.

# Dates
- Today is ${today}. The newest month that has ledger and invoice data is ${latestMonth} (period ${latestPeriod}). There is no data after it.
- period_no is a month written YYYYMM as an integer. June 2026 = 202606. Compare months with period_no, never with dates, on the ledger${views ? " views" : " tables (pbalance, budget_pbalance)"}.
- "Previous month" of 202601 is 202512.
- If a "Context" line says which period the user has on screen, and the question names no month, use that period instead of the newest month. A month named in the question always wins.
- If the question says "assume it is now <month>" (or similar), treat that month as the current month and do not use later data.
- "Currently", "now" and "overdue" for receivables are measured against today's date. For profit and loss questions with no month named, use the newest month (${latestPeriod}).
- Invoice dates are real dates: filter a month with doc_date >= date 'YYYY-MM-01' and doc_date < date 'YYYY-(MM+1)-01'.

# Tables and views (all amounts are in SGD)
${views ? VIEWS_TABLES_BLOCK : LEDGER_TABLES_BLOCK}
${COMMON_TABLES_BLOCK}
Joins: ${views ? "" : "pbalance.acc_no = gl_mast.acc_no; pbalance.dept_no = dept.dept_no; "}iv_dtl.doc_key = iv.doc_key; iv.debtor_code = debtor.acc_no; iv_dtl.item_code = item.item_code; item.item_group = item_group.item_group; ar_invoice.debtor_code = debtor.acc_no.
${views ? VIEWS_SECTION : ""}${mlTablesEnabled() ? mlEnabledSection(latestPeriod) : ML_DISABLED_SECTION}
# Accounting rules (these decide whether the numbers are right)
${views ? VIEWS_RULES : LEDGER_RULES}
- Sales by customer or product come from invoices, not the ledger: sum(iv_dtl.local_sub_total) over invoices where iv.cancelled is false. Product gross profit = sum(local_sub_total) - sum(local_total_cost) on iv_dtl. Totals from invoices can differ slightly from ledger revenue; that is normal.
- Receivables: use ar_invoice where cancelled is false and outstanding > 0. A balance is overdue when due_date is before today. Days overdue = date '${today}' - due_date. "Outstanding balance" means total outstanding regardless of due date.
- The ledger cannot be split by branch. Branch only exists on invoices.
- Compare two periods by summing each with CASE WHEN period_no = ... in ONE query, then subtract, rather than guessing from two separate queries.
- Change and "what drove / what caused / why" questions about a ledger figure (revenue, cost of sales, expenses, margin, profit): use up to three queries. (1) Company totals for each month for the figure in question (for margin questions: revenue, cost of sales, gross profit and gross_margin_pct per month), so the direction and size of the change are explicit and checkable. (2) The change broken down by department. (3) The change broken down by account${views ? " (v_monthly_account)" : " (join gl_mast)"}. Rank breakdowns by size of change.
- Margin questions ("did margin improve", "what caused gross margin to rise"): the answer is a PERCENTAGE. Return the margin % for each month and the change in percentage points, then which departments moved it. Do not substitute a currency amount.
- For questions about customers or products, break the change down from invoices instead (by company_name, or by item.description; use item_group.description only when product groups are asked for).
- If a change question names no month, compare the newest month with data against the month before it. If the question assumes something ("why did profit fall"), still fetch the totals for both periods so the answer can show whether it did.
- Overdue receivables over time: payment history is not stored, so the balance on an earlier date cannot be rebuilt. But the increase in overdue between date A and date B is the outstanding on invoices whose due_date is on or after A and before B and that are still unpaid. "This month" for receivables means since the last day of the previous month.

# Examples (patterns to follow; the months here are only illustrations)
${examples.map(render).join("\n\n")}`;
}
