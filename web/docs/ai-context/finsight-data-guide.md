# FinSight data guide (context for the AI assistant)

This file is written to be given to the AI model as background knowledge. It
explains what the database tables mean, what each part of the dashboard shows,
and exactly how every number is calculated, so the assistant can explain the
screen accurately without guessing.

It was written from the code in `web/app/dashboard/data/` and
`web/prisma/schema.prisma`. If you change a calculation there, change it here.
Nothing loads this file automatically yet; see "Using this file" at the end.

---

## 1. Ground rules for the assistant

- Explain what is on the screen and how it is calculated. Do not invent figures.
  Only quote numbers that are given to you in the conversation or data you were
  handed.
- All money is stored and calculated in SGD (the home currency). The user may
  display amounts in SGD, USD or MYR. Conversion happens only when displaying,
  using the daily reference rates from Frankfurter (European Central Bank data).
- The app is read-only. It never changes ledger data.
- Be honest about gaps. Section 8 lists what the app cannot do or show. If asked
  about something there, say so plainly instead of guessing.
- The user is a General Manager of TSH Group reviewing company performance, not
  an accountant. Prefer plain language, and define a term the first time you use it.

---

## 2. Where the data comes from

The data is the company's accounting ledger, held in 17 tables that follow the
AutoCount accounting software's structure. They live in a Postgres database
hosted on Supabase and are read through Prisma. The tables are loaded from the
accounting system; this app does not create or edit them.

## 3. Core concepts

**Accounting period (`period_no`).** A month, written as a six-digit number
`YYYYMM`. For example `202608` is August 2026. The screen shows it as `2026-08`.
The list of selectable months is every distinct period that has balances, newest
first, and the newest month is selected by default.

**Debit and credit (`home_dr`, `home_cr`).** Every ledger balance is stored as a
debit amount and a credit amount in the home currency. Revenue and income accounts
normally carry credits; costs and expenses normally carry debits. The app turns
these into a plain positive "amount" for each account type as described below.

**Account types.** Each ledger account has a two-letter type. The dashboard only
uses these four:

| Code | Meaning | Treated as |
|---|---|---|
| `RE` | Operating revenue | Credits minus debits (positive when the company earned) |
| `OI` | Other income | Credits minus debits |
| `CS` | Cost of sales | A cost; reduces profit |
| `EX` | Operating expenses | A cost; reduces profit |

Other account types exist (the `acc_type` table marks which are balance-sheet
types) but no dashboard panel uses them.

**Business unit.** In the app a "business unit" is an accounting department
(`dept`). Filtering by business unit keeps only ledger rows and invoice lines
posted to the chosen departments.

**Branch.** A sales branch. Branches are only recorded on invoices, not on ledger
balances or budgets (see section 8).

**Budget.** A named budget scenario (`budget`) with a planned amount for each
period, account and department (`budget_pbalance`). A comparison with budget is
only shown when exactly one budget scenario exists for the month. The app never
adds two scenarios together.

---

## 4. Database tables

"Used by dashboard" means one of the dashboard panels in section 5 reads it.

| Table | What a row represents | Key columns | Used by dashboard |
|---|---|---|---|
| `acc_type` | An account-type code and its description | `acc_type`, `description`, `is_bs_type` | Indirectly (type codes) |
| `gl_mast` | One account in the chart of accounts | `acc_no`, `parent_acc_no`, `description`, `acc_type` | Yes. Gives each balance its type |
| `pbalance` | The ledger movement for one month, one account and one department | `period_no`, `acc_no`, `dept_no`, `home_dr`, `home_cr` | Yes. Source of revenue, expenses, profit, margins |
| `budget` | A budget scenario | `budget_key`, `budget_name` | Yes. Used to check there is a single scenario |
| `budget_pbalance` | Planned amount for one scenario, month, account and department | `budget_key`, `period_no`, `acc_no`, `dept_no`, `amount` | Yes. Budget side of the P&L and KPI variance |
| `pl_format` | One line of the Profit and Loss layout, in order | `seq`, `row_type`, `acc_type`, `description`, `credit_as_positive` | Yes. Defines the P&L rows |
| `dept` | A department / business unit | `dept_no`, `description`, `segment` | Yes. Business unit filter |
| `branch` | A branch | `branch_code`, `branch_name`, `is_active` | Yes. Branch filter (inactive branches are kept so history stays reachable) |
| `iv` | A sales invoice header | `doc_key`, `doc_no`, `debtor_code`, `doc_date`, `branch_code`, `cancelled`, `local_ex_tax`, `local_net_total` | Yes. Date, branch and cancelled flag |
| `iv_dtl` | One line on a sales invoice | `doc_key`, `item_code`, `dept_no`, `qty`, `unit_price`, `local_sub_total` | Yes. Source of revenue by product group |
| `item` | A product or service | `item_code`, `description`, `item_group` | Yes. Links a line to a product group |
| `item_group` | A product group | `item_group`, `description`, `sales_code` | Yes. Names the groups in the donut |
| `gl_dtl` | An individual ledger posting (journal line) | `acc_no`, `dept_no`, `trans_date`, `journal_type`, `home_dr`, `home_cr` | No |
| `ar_invoice` | A receivable invoice | `debtor_code`, `doc_date`, `due_date`, `local_net_total`, `local_payment_amt`, `outstanding`, `cancelled` | No (used by chat questions) |
| `debtor` | A customer | `acc_no`, `company_name`, `credit_limit`, `display_term` | No |
| `sales_agent` | A salesperson | `sales_agent`, `description`, `is_active` | No |
| `fiscal_year` | A financial year and its dates | `fiscal_year_name`, `from_date`, `to_date`, `is_active` | No |

`pbalance` holds the movement for each month, not a running total. Year to date
is produced by adding the months of the year together.

---

## 5. The dashboard, panel by panel

The dashboard page has six labelled parts. Each shows a small numbered badge in its
top-left corner. The label id is what the assistant returns when it wants a part
highlighted (see section 7).

### 1 · `filters` — Reporting scope

Controls what every panel below shows.

- **Period.** Either one month ("Specific month") or a range ("Date range", start
  and end months). Default: the newest month with data.
- **Business units.** One or more departments. Empty means all.
- **Branches.** One or more branches. Empty means all.
- Changes only take effect when the user presses **Apply Filters**. The chosen
  scope is kept in the page address, so a link reproduces the same view.
- If the selection is invalid (an unknown month, unit or branch, or a start after
  the end), the filters panel shows an error and the other panels show the same
  message instead of data.
- **Branch limitation.** Choosing any branch makes the KPI cards, both trend
  charts and the P&L show a "not available yet" message, because ledger balances
  and budgets cannot be attributed to branches. Only Revenue by Product Group
  works with a branch.

### 2 · `kpi-cards` — Financial overview

Seven headline figures for one month, each compared with the month before.
The month shown is the **selected month, or the last month of the range** if a
range is chosen. "Prior" is the calendar month immediately before it (January
compares with the previous December).

For the month, take the sum of (credits − debits) for each account type, giving
`RE`, `OI`, `CS`, `EX`. `CS` and `EX` come out negative because they are mostly
debits. Then:

| Card | Calculation |
|---|---|
| Revenue | `RE` |
| Gross profit | Revenue + `CS` (i.e. revenue minus cost of sales) |
| Net profit | Gross profit + `OI` + `EX` (revenue − cost of sales + other income − operating expenses). Tax appears only if it was posted to an `EX` account |
| Budget variance | Actual net profit − budgeted net profit for the same month. Positive means above plan |
| Gross margin | Gross profit ÷ revenue × 100 |
| Net margin | Net profit ÷ revenue × 100 |
| Operating expense ratio | Operating expenses (`EX`) ÷ revenue × 100. Excludes cost of sales. **A decrease is favorable** |

- **Change vs prior** = (this month − prior month) ÷ |prior month| × 100. If the
  prior month is zero the percentage is not shown, because it would be meaningless.
- Margins and the expense ratio are not calculated (shown as unavailable) when revenue is zero.
- Favorable / unfavorable colouring: higher is better for every card except the
  operating expense ratio.
- **Attention thresholds.** The user can set a minimum and maximum for each
  card. A value outside its limits is flagged for attention. These limits are
  saved in the user's own browser, not on a server.
- If the prior month or the budget is missing, the card says so rather than
  showing zero.

### 3 · `revenue-vs-expenses` — Revenue vs Operating Expenses

A clustered bar chart. For each month: a navy bar for revenue and a red bar for
operating expenses.

- Revenue = credits − debits on `RE` accounts.
- Operating expenses = debits − credits on `EX` accounts.
- **Cost of sales (`CS`) and other income (`OI`) are not included here.** So this
  chart's gap is not the same as net profit; see the next panel.
- Months shown: for a single selected month, up to the **six most recent months
  up to and including it** (that exist in the data), to give context. For a
  range, **every month in the range**.

### 4 · `profit-margin` — Net Profit and Margin

A combined chart. Bars (left axis, currency) are net profit per month. A red line
(right axis, percent) is net margin per month. Same months as panel 3.

- Net profit = revenue (`RE`) + other income (`OI`) − cost of sales (`CS`) −
  operating expenses (`EX`).
- Net margin % = net profit ÷ revenue × 100. If a month's revenue is zero the line
  has a gap for that month.
- Unlike panel 3, this includes cost of sales and other income.

### 5 · `revenue-by-group` — Revenue by Product Group

A donut chart of how revenue splits across product groups, from **sales invoices**
rather than the ledger.

- Adds up each invoice line's sub-total (`iv_dtl.local_sub_total`) for
  **non-cancelled** invoices dated within the selected period (first day of the
  start month through the end of the end month).
- Each line is assigned to its item's product group (`item` → `item_group`). Lines
  whose item has no group are shown as **"Uncategorized"**.
- Each slice's percentage = group total ÷ all groups' total × 100. Slices are
  sorted largest first.
- Responds to **all** filters, including branch (invoices carry a branch) and
  business unit (the department on the line).
- Slice labels are drawn on the chart only when there are six groups or fewer.
  Otherwise use the legend and hover.
- Because this comes from invoices and not the ledger, **its total can differ
  from the revenue in panels 2, 3 and 4.** Do not tell the user they must match.

### 6 · `profit-loss` — Profit and Loss Statement

A table laid out by the rows of `pl_format`.

| Column | Meaning |
|---|---|
| Description | The row name |
| Month-to-Date | Actual for the **selected month, or the last month of a range** |
| Year-to-Date | Actual from January of that year through that month, same business unit |
| Month Budget | The budget for that single month. There is no year-to-date budget column |
| Variance % | (Month-to-Date − Month Budget) ÷ \|Month Budget\| × 100. Blank when the budget is zero |

- Row types: header rows (`H`) are section titles, account rows (`A`) are lines
  built from one account type, subtotal rows (`S`) add up the lines above them
  since the previous subtotal. Profit rows combine the previous subtotal with the
  lines that follow it: income-type lines add, cost-type lines subtract.
- Each row's `credit_as_positive` flag decides its sign. Income-type rows show
  credits as positive; cost-type rows show debits as positive.
- The ▲ / ▼ arrow shows whether actual is above or below budget. **Green means
  favorable and red unfavorable**, which depends on the row: higher income is
  favorable, higher costs are not.
- Budget values are stored as debit-positive amounts. The app flips the sign for
  credit-natured rows so they read like the actuals.
- Notices appear above the table when a month has no actual balances, or when no
  single budget scenario applies (then the budget and variance columns are hidden).

---

## 6. Which panels respond to which filter

| Panel | Month / range | Business unit | Branch |
|---|---|---|---|
| 2 KPI cards | Last month of the range only | Yes | No (shows message) |
| 3 Revenue vs Expenses | Yes (single month shows up to 6 months of context) | Yes | No (shows message) |
| 4 Net Profit and Margin | Same as 3 | Yes | No (shows message) |
| 5 Revenue by Product Group | Whole range | Yes | **Yes** |
| 6 Profit and Loss | Last month of the range only (plus year-to-date) | Yes | No (shows message) |

Mention this when a user chooses a range: the KPI cards and the P&L describe the
last month of the range, while the charts cover the whole range.

---

## 7. Pointing at the dashboard while answering

When the user is on the dashboard, an answer can come with a **walkthrough**: the
charts and tables that help explain it, in the order you explain them. The app
highlights each one on the page while it shows your sentence, so the General
Manager can see what you are talking about.

### What the app sends you

Alongside the question, the app may send `context` describing what is on screen:

```json
{ "page": "dashboard", "periodStart": "202606", "periodEnd": "202608",
  "units": ["A"], "branches": [] }
```

- `periodStart` / `periodEnd` are `YYYYMM`. If they are absent the dashboard is on
  its default, the latest month with data. `units` and `branches` empty means all.
- Explain the period and filters the user is actually looking at. If the question is
  about a different month, say so and answer it, but do not claim the highlighted
  chart shows that month.
- If there is no `context`, the user is not on the dashboard. Do not return a
  walkthrough.

### What you send back

Return the normal `reply` text, and **optionally** a `walkthrough`:

```json
{
  "reply": "Net profit rose this month.",
  "walkthrough": {
    "opening": "Here is where to see it on your dashboard.",
    "steps": [
      { "label": "profit-margin", "explanation": "Two or three plain sentences about this chart." },
      { "label": "profit-loss",   "explanation": "…" }
    ]
  }
}
```

Rules:

- `label` must be one of these ids, written exactly: `filters`, `kpi-cards`,
  `revenue-vs-expenses`, `profit-margin`, `revenue-by-group`, `profit-loss`.
  The page shows them as badges 1 to 6 in that order. Anything else is ignored.
- Use each id **at most once**, in the order you want them shown. Use only the
  parts that help answer *this* question (one is fine). A full walk-through of the
  dashboard uses all six, in the order above.
- Leave `walkthrough` out entirely when no panel helps. There is no panel for
  receivables, per-customer sales or forecasts, so do not invent a label for them.
- `explanation` is plain text, two or three sentences, no Markdown. Tie it to what
  the panel shows and to the answer. Only quote figures you were actually given.
- `opening` is plain text, one or two sentences. Do not repeat `reply` in it.
- Do not return titles or numbers. The app adds those itself.

---

## 8. What the app cannot do (do not claim otherwise)

- **No forecasts or predictions yet.** A separate ML service exists but is not
  connected to any screen or to the assistant.
- **No branch view of ledger figures.** Profit, expenses, KPIs, budgets and the
  P&L cannot be split by branch.
- **No per-customer or receivables view on the dashboard.** The `debtor` and
  `ar_invoice` tables are not shown on any dashboard panel.
- **No year-to-date budget** in the P&L, only the single month's budget.
- **No tax breakdown.** Tax appears in profit only if it was posted to an
  operating-expense account.
- **Alerts are only in the user's browser.** Thresholds and notifications are
  stored locally; nothing is emailed or pushed.
- **The Insights and Reports pages are sample layouts**, not live data, and
  should not be described as real analysis.
- Whether invoice line sub-totals include tax is not stated in the data model,
  so do not say either way.

---

## Using this file

Nothing reads this file yet. To feed it to the model, load the Markdown text on
the server and include it in the system prompt or as a context document for the
call that produces the tour (and, if wanted, the chat answers). Keep it in
sync with the code: the calculations in section 5 are the same ones implemented in
`web/app/dashboard/data/*-utils.ts`.
