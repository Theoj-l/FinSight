import "server-only";
import { activeBusinessUnits } from "./business-units";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ledgerDepartment,
  type DashboardScope,
} from "@/app/dashboard/data/dashboard-scope";
import {
  compareValues,
  emptyValues,
  sumComplete,
  validRules,
  valuesFrom,
} from "./engine";
import {
  selectForecastReference,
  type ForecastReferenceRow,
} from "./forecast-reference";
import {
  addMonth,
  defaultRules,
  isPeriod,
  isSource,
  type Components,
  type FinancialBundle,
  type SourceSeries,
  type Values,
} from "./types";

type Balance = {
  dept_no: string;
  period_no: number;
  acc_type: keyof Components;
  amount: string;
};
type BudgetBalance = Balance & { budget_key: string };
export async function getFinancialSettings() {
  const row = await prisma.financial_settings.findUnique({ where: { id: 1 } });
  if (row && !validRules(row.rules) && JSON.stringify(row.rules) !== "{}")
    throw new Error(
      "Shared financial rules are invalid. Review Threshold Settings.",
    );
  return {
    rules: row && validRules(row.rules) ? row.rules : defaultRules(),
    notificationSource:
      row && isSource(row.notification_source)
        ? row.notification_source
        : ("previous" as const),
    notificationBudgetId: row?.notification_budget_key?.toString() ?? null,
  };
}
export async function getFinancialBundle(
  scope: DashboardScope = {},
): Promise<FinancialBundle | null> {
  ledgerDepartment(scope); // reject unsupported branches before financial reads
  const period =
    scope.period ??
    (
      await prisma.pbalance.findFirst({
        orderBy: { period_no: "desc" },
        select: { period_no: true },
      })
    )?.period_no;
  if (!period) return null;
  if (!isPeriod(period)) throw new RangeError("Invalid reporting month.");
  const periods = [
    ...new Set([
      period,
      ...(scope.trendPeriodNumbers ?? []),
      ...(scope.periodNumbers ?? []),
    ]),
  ].sort((a, b) => a - b);
  if (!scope.trendPeriodNumbers && !scope.periodNumbers)
    for (let i = 5; i > 0; i--) periods.unshift(addMonth(period, -i));
  periods.sort((a, b) => a - b);
  const activeUnits = await activeBusinessUnits();
  const selectedUnits = scope.departmentIds?.length ? scope.departmentIds.filter(d => activeUnits.includes(d)) : activeUnits;
  const departmentSql = scope.departmentIds?.length
    ? Prisma.sql`AND p.dept_no IN (${Prisma.join(scope.departmentIds)})`
    : Prisma.empty;
  const forecastSql = scope.departmentIds?.length
    ? Prisma.sql`AND f.dept_no IN (${Prisma.join(scope.departmentIds)})`
    : Prisma.empty;
  const sourceErrors: FinancialBundle["sourceErrors"] = {};
  const unavailable = (source: "budget" | "manual" | "auto") => {
    sourceErrors[source] =
      "This comparison source could not be loaded. Refresh to retry. Actual ledger values remain available.";
    return [];
  };
  const [settings, actual, budgets, manual, scenarios, forecast] =
    await Promise.all([
      Promise.resolve().then(() => getFinancialSettings()),
      Promise.resolve().then(() => prisma.$queryRaw<
        Balance[]
      >(Prisma.sql`SELECT p.dept_no, p.period_no, g.acc_type,
      SUM(CASE WHEN g.acc_type IN ('RE','OI') THEN p.home_cr-p.home_dr ELSE p.home_dr-p.home_cr END)::text AS amount
      FROM pbalance p JOIN gl_mast g ON g.acc_no=p.acc_no WHERE g.acc_type IN ('RE','OI','CS','EX') AND p.period_no <= ${period} ${departmentSql}
      GROUP BY p.dept_no,p.period_no,g.acc_type`)),
      Promise.resolve().then(() => prisma
        .$queryRaw<BudgetBalance[]>(
          Prisma.sql`SELECT p.dept_no,p.period_no,p.budget_key::text,g.acc_type,
      SUM(CASE WHEN g.acc_type IN ('RE','OI') THEN -p.amount ELSE p.amount END)::text AS amount
      FROM budget_pbalance p JOIN gl_mast g ON g.acc_no=p.acc_no WHERE g.acc_type IN ('RE','OI','CS','EX') AND p.period_no IN (${Prisma.join(periods)}) ${departmentSql}
      GROUP BY p.dept_no,p.period_no,p.budget_key,g.acc_type`,
        )
        ).catch(() => unavailable("budget")),
      Promise.resolve().then(() => prisma.financial_manual_forecast
        .findMany({
          where: {
            period_no: { in: periods },
            ...(scope.departmentIds?.length
              ? { dept_no: { in: scope.departmentIds } }
              : {}),
          },
        })
        ).catch(() => unavailable("manual")),
      Promise.resolve().then(() => prisma.budget
        .findMany({ orderBy: { budget_name: "asc" } })
        ).catch(() => unavailable("budget")),
      Promise.resolve().then(() => prisma
        .$queryRaw<ForecastReferenceRow[]>(
          Prisma.sql`SELECT f.run_id::text,f.kind,f.dept_no,f.metric,f.origin,f.period_no,f.yhat::text,
      r.finished_at::text AS finished_at
      FROM forecast_value f JOIN forecast_run r ON r.run_id=f.run_id WHERE r.status='ok'
      AND f.metric IN ('revenue','profit') AND f.period_no IN (${Prisma.join(periods)}) AND f.origin < f.period_no ${forecastSql}`,
        )
        ).catch(() => unavailable("auto")),
    ]);
  const departments = [...new Set(selectedUnits)].sort();
  const types: (keyof Components)[] = ["RE", "CS", "OI", "EX"];
  const components = (rows: Balance[], p: number, budget = false): Components =>
    Object.fromEntries(
      types.map((type) => [
        type,
        sumComplete(
          departments.map((dept) => {
            const own = rows.filter(
              (r) => r.dept_no === dept && r.period_no === p,
            );
            const typed = own.filter((r) => r.acc_type === type);
            if (typed.length) return sumComplete(typed.map((r) => r.amount));
            if (!budget) return own.length ? "0" : null;
            // Budget zero must be explicit, even for a component with no past
            // postings. Absence of history does not define a future plan.
            return null;
          }),
        ),
      ]),
    ) as Components;
  const actualValues = (p: number) => valuesFrom(components(actual, p));
  const sources = { previous: {}, budget: {}, auto: {}, manual: {} } as Record<
    "previous" | "budget" | "auto" | "manual",
    SourceSeries
  >;
  const budgetSources: Record<string, SourceSeries> = {};
  const makePeriod = (p: number, reference: Values, notes: string[] = []) => ({
    period: p,
    metrics: compareValues(
      actualValues(p),
      reference,
      settings.rules,
      notes.join(" "),
    ),
    provenance: notes,
  });
  const budgetCoverage = (rows: Balance[], p: number) => {
    const missing = departments.filter(d => types.some(type => !rows.some(r => r.dept_no === d && r.period_no === p && r.acc_type === type)));
    return missing.length ? `Missing budget components for business units: ${missing.join(", ")}.` : "Complete business-unit coverage.";
  };
  for (const p of periods) {
    sources.previous[p] = makePeriod(p, actualValues(addMonth(p, -1)), [
      `Compared with previous calendar month ${addMonth(p, -1)}.`,
    ]);
    const keys = [
      ...new Set(
        budgets.filter((r) => r.period_no === p).map((r) => r.budget_key),
      ),
    ];
    sources.budget[p] = makePeriod(
      p,
      !sourceErrors.budget && keys.length === 1
        ? valuesFrom(
            components(
              budgets.filter((r) => r.budget_key === keys[0]),
              p,
              true,
            ),
          )
        : emptyValues(),
      [
        sourceErrors.budget ??
          (keys.length > 1
            ? "Multiple budget scenarios exist. Select a scenario."
            : keys.length
              ? `Budget amounts; missing components remain unavailable. ${budgetCoverage(budgets.filter(r => r.budget_key === keys[0]), p)} Enter explicit zero amounts where appropriate.`
              : "No budget is available for this month."),
      ],
    );
    for (const scenario of scenarios) {
      const id = scenario.budget_key.toString();
      budgetSources[id] ??= {};
      const rows = budgets.filter(
        (r) => r.budget_key === id && r.period_no === p,
      );
      budgetSources[id][p] = makePeriod(
        p,
        !sourceErrors.budget && rows.length
          ? valuesFrom(components(rows, p, true))
          : emptyValues(),
        [sourceErrors.budget ?? `Budget scenario: ${scenario.budget_name}. ${budgetCoverage(rows, p)}`],
      );
    }
    const auto = emptyValues(),
      human = emptyValues(),
      notes: string[] = [];
    for (const metric of ["revenue", "netProfit"] as const) {
      const estimate = selectForecastReference(
        forecast,
        departments,
        p,
        metric,
      );
      auto[metric] = estimate.value;
      notes.push(`${metric}: ${sourceErrors.auto ?? estimate.note}`);
      human[metric] = sumComplete(
        departments.map((dept) => {
          const row = manual.find(
            (r) =>
              r.dept_no === dept && r.period_no === p && r.metric === metric,
          );
          return row ? row.amount.toString() : null;
        }),
      );
    }
    sources.auto[p] = makePeriod(p, auto, notes);
    sources.manual[p] = makePeriod(p, human, [
      sourceErrors.manual ??
        `Manual forecasts are human estimates. Missing coverage: ${departments.filter(d => ["revenue", "netProfit"].some(metric => !manual.some(r => r.dept_no === d && r.period_no === p && r.metric === metric))).join(", ") || "none"}. No automatic substitution.`,
    ]);
  }
  const startYear = Math.floor(period / 100) * 100 + 1;
  const ytdComponents = Object.fromEntries(
    types.map((type) => [
      type,
      sumComplete(
        departments.map((dept) => {
          const own = actual.filter(
            (r) =>
              r.dept_no === dept &&
              r.period_no >= startYear &&
              r.period_no <= period,
          );
          return own.length
            ? sumComplete([
                "0",
                ...own.filter((r) => r.acc_type === type).map((r) => r.amount),
              ])
            : null;
        }),
      ),
    ]),
  ) as Components;
  return {
    period,
    departments,
    ...settings,
    sources,
    budgetSources,
    sourceErrors,
    budgets: scenarios.map((s) => ({
      id: s.budget_key.toString(),
      name: s.budget_name,
    })),
    ytd: valuesFrom(ytdComponents),
    scopeLabel: departments.join(", "),
    forecastNotice:
      "Auto forecast supports operating revenue and final profit only. Estimates are not guarantees. See Forecast for accuracy and typical outcome ranges.",
  };
}
