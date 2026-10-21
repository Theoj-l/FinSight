// ---------------------------------------------------------------------------
// virtual-views.ts — pre-computed profit-and-loss tables the model can query
// WITHOUT anything being created in the database.
//
// The model writes SQL against v_monthly_pl, v_monthly_account and
// v_budget_variance as if they were tables. Just before the query runs,
// expandVirtualViews() adds the definitions below as a WITH clause. They do the
// debit/credit arithmetic once, here, in trusted code, because the model got
// the signs wrong when it did them itself (profit reported as $4.7M).
//
// Pure: no I/O. The definitions were checked against the golden figures
// (net profit 946,629.66, gross margin 29.59 / 29.17 / 29.95%, and so on).
// ---------------------------------------------------------------------------

export interface VirtualView {
  name: string;
  /** Other virtual views this one reads. */
  dependsOn: string[];
  /** The real tables it reads, so "tables used" still reports the true data sources. */
  sources: string[];
  body: string;
}

// One row per month, department and account, for the four profit-and-loss account
// types: RE revenue, OI other income, CS cost of sales, EX operating expenses.
//   amount        positive in the account's natural direction (revenue and income
//                 earned, costs spent)
//   profit_effect credit minus debit: positive when it raises profit, negative when
//                 it lowers it. Summing it over every row gives net profit.
const MONTHLY_ACCOUNT = `select
  p.period_no,
  p.dept_no,
  d.description as department,
  p.acc_no,
  g.description as account,
  g.acc_type,
  case when g.acc_type in ('RE', 'OI') then p.home_cr - p.home_dr else p.home_dr - p.home_cr end as amount,
  p.home_cr - p.home_dr as profit_effect
from public.pbalance p
join public.gl_mast g on g.acc_no = p.acc_no
join public.dept d on d.dept_no = p.dept_no
where g.acc_type in ('RE', 'OI', 'CS', 'EX')`;

// One row per month and department. Costs are positive numbers.
const MONTHLY_PL = `select
  period_no,
  dept_no,
  department,
  sum(case when acc_type = 'RE' then amount else 0 end) as revenue,
  sum(case when acc_type = 'CS' then amount else 0 end) as cost_of_sales,
  sum(case when acc_type = 'RE' then amount when acc_type = 'CS' then -amount else 0 end) as gross_profit,
  sum(case when acc_type = 'EX' then amount else 0 end) as operating_expenses,
  sum(case when acc_type = 'OI' then amount else 0 end) as other_income,
  sum(profit_effect) as net_profit
from v_monthly_account
group by period_no, dept_no, department`;

// Actual against budget. Only months with exactly ONE budget scenario appear (several
// scenarios are never added together). Budget amounts are stored debit-positive, so
// revenue and income are flipped to read like the actuals.
//   variance        actual minus budget
//   adverse_amount  POSITIVE means worse than plan: a cost above budget, or
//                   revenue/income below budget. Negative means better than plan.
const BUDGET_VARIANCE = `with single_budget as (
  select period_no
  from public.budget_pbalance
  group by period_no
  having count(distinct budget_key) = 1
),
planned as (
  select b.period_no, b.dept_no, b.acc_no, sum(b.amount) as debit_positive_amount
  from public.budget_pbalance b
  join single_budget s on s.period_no = b.period_no
  group by b.period_no, b.dept_no, b.acc_no
),
real as (
  select period_no, dept_no, acc_no, sum(amount) as amount
  from v_monthly_account
  group by period_no, dept_no, acc_no
),
joined as (
  select
    coalesce(r.period_no, pl.period_no) as period_no,
    coalesce(r.dept_no, pl.dept_no) as dept_no,
    coalesce(r.acc_no, pl.acc_no) as acc_no,
    coalesce(r.amount, 0) as actual,
    pl.debit_positive_amount
  from real r
  full join planned pl on pl.period_no = r.period_no and pl.dept_no = r.dept_no and pl.acc_no = r.acc_no
  where coalesce(r.period_no, pl.period_no) in (select period_no from single_budget)
)
select
  j.period_no,
  j.dept_no,
  d.description as department,
  j.acc_no,
  g.description as account,
  g.acc_type,
  j.actual,
  case when g.acc_type in ('RE', 'OI') then -coalesce(j.debit_positive_amount, 0) else coalesce(j.debit_positive_amount, 0) end as budget,
  j.actual - case when g.acc_type in ('RE', 'OI') then -coalesce(j.debit_positive_amount, 0) else coalesce(j.debit_positive_amount, 0) end as variance,
  case
    when g.acc_type in ('CS', 'EX') then j.actual - coalesce(j.debit_positive_amount, 0)
    else (-coalesce(j.debit_positive_amount, 0)) - j.actual
  end as adverse_amount
from joined j
join public.gl_mast g on g.acc_no = j.acc_no
join public.dept d on d.dept_no = j.dept_no
where g.acc_type in ('RE', 'OI', 'CS', 'EX')`;

/** Listed so that a view always comes after the views it depends on. */
export const VIRTUAL_VIEWS: VirtualView[] = [
  { name: "v_monthly_account", dependsOn: [], sources: ["pbalance", "gl_mast", "dept"], body: MONTHLY_ACCOUNT },
  { name: "v_monthly_pl", dependsOn: ["v_monthly_account"], sources: ["pbalance", "gl_mast", "dept"], body: MONTHLY_PL },
  {
    name: "v_budget_variance",
    dependsOn: ["v_monthly_account"],
    sources: ["pbalance", "budget_pbalance", "gl_mast", "dept"],
    body: BUDGET_VARIANCE,
  },
];

export const VIRTUAL_VIEW_NAMES = VIRTUAL_VIEWS.map((view) => view.name);

export function viewSources(name: string): string[] {
  return VIRTUAL_VIEWS.find((view) => view.name === name)?.sources ?? [];
}

/**
 * Add the definitions of the virtual views a query uses (and any they depend on)
 * as a WITH clause in front of it. If the query already starts with WITH, its own
 * definitions are kept and follow ours.
 */
export function expandVirtualViews(sql: string, used: string[]): string {
  if (used.length === 0) return sql;

  const needed = new Set<string>();
  const add = (name: string) => {
    if (needed.has(name)) return;
    needed.add(name);
    for (const dependency of VIRTUAL_VIEWS.find((view) => view.name === name)?.dependsOn ?? []) add(dependency);
  };
  used.forEach(add);

  const definitions = VIRTUAL_VIEWS.filter((view) => needed.has(view.name))
    .map((view) => `${view.name} as (\n${view.body}\n)`)
    .join(",\n");

  const trimmed = sql.trim();
  return /^with\s/i.test(trimmed) ? `with ${definitions},\n${trimmed.replace(/^with\s+/i, "")}` : `with ${definitions}\n${trimmed}`;
}
