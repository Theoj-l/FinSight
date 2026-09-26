// ---------------------------------------------------------------------------
// mock-replies.ts — canned answers for the chat widget's demo mode
// (NEXT_PUBLIC_CHAT_MOCK=true). Pure: no imports, no I/O.
//
// Every figure here is invented. The widget shows a "Demo mode" banner, and
// each numeric answer ends with a sample-data note, so fake numbers can't be
// mistaken for real ledger data even if someone copies the text out.
// ---------------------------------------------------------------------------

/** Send this as a message in demo mode to see the error state and "Try again". */
export const MOCK_ERROR_COMMAND = "/error";

const SAMPLE_NOTE = "\n\n*Sample data — demo mode, not from the ledger.*";

const RECEIVABLES = `Outstanding receivables total **SGD 2,318,400**, of which **SGD 764,900 (33%)** is overdue.

| Customer | Outstanding (SGD) | Overdue (SGD) | Oldest (days) |
|:--|--:|--:|--:|
| ACME Sdn Bhd | 912,300 | 402,100 | 74 |
| Beta Trading | 655,800 | 231,600 | 41 |
| Gamma Corp | 420,700 | 131,200 | 28 |
| Others | 329,600 | 0 | — |

- ACME Sdn Bhd is the largest overdue balance and the main collection risk.
- Nothing older than 90 days.${SAMPLE_NOTE}`;

const PROFIT = `Net profit was **SGD 486,200** this month, **up 8.4%** from SGD 448,500 last month.

| | This month (SGD) | Last month (SGD) | Change |
|:--|--:|--:|--:|
| Revenue | 3,912,000 | 3,720,000 | +5.2% |
| Cost of sales | 2,671,000 | 2,569,000 | +4.0% |
| Operating expenses | 754,800 | 702,500 | +7.4% |
| **Net profit** | **486,200** | **448,500** | **+8.4%** |

- Revenue growth outpaced cost of sales, which lifted gross margin to **31.7%**.
- Operating expenses rose fastest, mainly payroll.${SAMPLE_NOTE}`;

const SALES = `**ACME Sdn Bhd** has the highest sales at **SGD 1,240,500**, about **26%** of the total.

| Rank | Customer | Sales (SGD) | Share |
|--:|:--|--:|--:|
| 1 | ACME Sdn Bhd | 1,240,500 | 26% |
| 2 | Beta Trading | 982,300 | 21% |
| 3 | Gamma Corp | 754,100 | 16% |

- The top three customers account for **63%** of sales.
- Beta Trading grew \`+8.4%\` versus last month.${SAMPLE_NOTE}`;

const HELP = `I can help with three areas:

- **Profit & Loss** — revenue, costs, margins and how they changed
- **Sales** — top customers, trends and comparisons
- **Accounts Receivable** — outstanding and overdue balances

Try one of the suggested questions, or ask in your own words.

*Demo mode: answers are samples, not real data.*`;

const UNSUPPORTED =
  "I can only answer questions related to Profit & Loss, Sales, and Accounts Receivable.\n\n*Demo mode: answers are samples, not real data.*";

interface Rule {
  pattern: RegExp;
  reply: string;
}

// Order matters: the first match wins ("outstanding receivables by customer"
// must hit receivables, not sales).
const RULES: Rule[] = [
  { pattern: /receivable|outstanding|overdue|owe|collect|debtor|aging|ageing/i, reply: RECEIVABLES },
  { pattern: /profit|margin|net income|p&l|loss|expense|cost/i, reply: PROFIT },
  { pattern: /customer|sales|revenue|sold|best|top|highest/i, reply: SALES },
  { pattern: /^\s*(hi|hello|hey|help)\b|what can you|how do you work/i, reply: HELP },
];

/** The canned answer for a message, or `null` to simulate a failure. */
export function mockReplyFor(message: string): string | null {
  if (message.trim().toLowerCase() === MOCK_ERROR_COMMAND) return null;
  return RULES.find(({ pattern }) => pattern.test(message))?.reply ?? UNSUPPORTED;
}
