import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getFinancialBundle, getFinancialSettings } from "./data";
import { type FinancialWrite } from "./validation";
export async function readPlanningSettings(
  department?: string,
  period?: number,
  budgetId?: string,
  businessType?: string,
) {
  const [settings, departments, accounts, budgets] = await Promise.all([
    getFinancialSettings(),
    prisma.dept.findMany({
      select: { dept_no: true, description: true, segment: true },
      orderBy: { dept_no: "asc" },
    }),
    prisma.gl_mast.findMany({
      where: { acc_type: { in: ["RE", "CS", "EX", "OI"] } },
      select: { acc_no: true, description: true, acc_type: true },
      orderBy: { acc_no: "asc" },
    }),
    prisma.budget.findMany({
      select: { budget_key: true, budget_name: true },
      orderBy: { budget_name: "asc" },
    }),
  ]);
  if (department && !departments.some((d) => d.dept_no === department))
    throw new RangeError("Unknown department.");
  if (budgetId && !budgets.some((b) => b.budget_key.toString() === budgetId))
    throw new RangeError("Unknown budget scenario.");
  if (businessType && !["Machining", "Bulk"].includes(businessType)) throw new RangeError("Unknown business type.");
  if (department && businessType && !departments.some(d => d.dept_no === department && d.segment === businessType)) throw new RangeError("Business unit does not belong to this business type.");
  const units = department ? [department] : businessType ? departments.filter(d => d.segment === businessType).map(d => d.dept_no) : undefined;
  const [manual, entries] =
    department && period
      ? await Promise.all([
          prisma.financial_manual_forecast.findMany({
            where: { dept_no: department, period_no: period },
          }),
          budgetId
            ? prisma.budget_pbalance.findMany({
                where: {
                  dept_no: department,
                  period_no: period,
                  budget_key: BigInt(budgetId),
                },
              })
            : [],

        ])
      : [[], []];
  const bundle = period ? await getFinancialBundle({ period, departmentIds: units }) : null;
  const latest = await prisma.pbalance.findFirst({
    orderBy: { period_no: "desc" },
    select: { period_no: true },
  });
  return {
    ...settings,
    latestPeriod: latest?.period_no,
    departments,
    accounts,
    budgets: budgets.map((b) => ({
      id: b.budget_key.toString(),
      name: b.budget_name,
    })),
    manual: Object.fromEntries(
      manual.map((m) => [m.metric, m.amount.toString()]),
    ),
    entries: Object.fromEntries(
      entries.map((e) => [
        e.acc_no,
        (["RE", "OI"].includes(
          accounts.find((a) => a.acc_no === e.acc_no)?.acc_type ?? "",
        )
          ? e.amount.negated()
          : e.amount
        ).toString(),
      ]),
    ),
    automatic: bundle?.sources.auto[period ?? 0] ?? null,
    summary: bundle ? { units: bundle.departments, auto: bundle.sources.auto[period!], manual: bundle.sources.manual[period!], budget: (budgetId ? bundle.budgetSources[budgetId] : bundle.sources.budget)?.[period!] ?? null } : null,
    readOnly: !department,
  };
}
export async function writePlanningSettings(
  input: FinancialWrite,
  userId: string,
) {
  if (input.kind === "rules" || input.kind === "source") {
    if (
      input.kind === "source" &&
      input.budgetId &&
      !(await prisma.budget.findUnique({
        where: { budget_key: BigInt(input.budgetId) },
      }))
    )
      throw new RangeError("Unknown budget scenario.");
    const patch =
      input.kind === "rules"
        ? { rules: input.rules as unknown as Prisma.InputJsonValue }
        : {
            notification_source: input.source,
            notification_budget_key: input.budgetId
              ? BigInt(input.budgetId)
              : null,
          };
    await prisma.financial_settings.upsert({
      where: { id: 1 },
      create: { id: 1, ...patch, updated_by: userId },
      update: { ...patch, updated_by: userId, updated_at: new Date() },
    });
    return;
  }
  if (input.kind === "scenario") {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(4721003)`;
      if (
        await tx.budget.findFirst({
          where: { budget_name: { equals: input.name, mode: "insensitive" } },
        })
      ) {
        throw new RangeError(
          "A budget scenario with this name already exists. Choose another name.",
        );
      }
      const last = await tx.budget.aggregate({ _max: { budget_key: true } });
      await tx.budget.create({
        data: {
          budget_key: (last._max.budget_key ?? BigInt(0)) + BigInt(1),
          budget_name: input.name,
        },
      });
    });
    return;
  }
  if (!(await prisma.dept.findUnique({ where: { dept_no: input.department } })))
    throw new RangeError("Unknown department.");
  if (input.kind === "manual") {
    await prisma.$transaction(async (tx) => {
      for (const metric of ["revenue", "netProfit"] as const) {
        const where = {
          dept_no: input.department,
          period_no: input.period,
          metric,
        };
        const amount = input[metric];
        if (amount === null)
          await tx.financial_manual_forecast.deleteMany({ where });
        else
          await tx.financial_manual_forecast.upsert({
            where: { dept_no_period_no_metric: where },
            create: { ...where, amount, updated_by: userId },
            update: { amount, updated_by: userId, updated_at: new Date() },
          });
      }
    });
    return;
  }
  if (
    !(await prisma.budget.findUnique({
      where: { budget_key: BigInt(input.budgetId) },
    }))
  )
    throw new RangeError("Unknown budget scenario.");
  const accounts = await prisma.gl_mast.findMany({
    where: { acc_type: { in: ["RE", "CS", "EX", "OI"] } },
    select: { acc_no: true, acc_type: true },
  });
  if (
    input.entries.length !== accounts.length ||
    input.entries.some((e) => !accounts.some((a) => a.acc_no === e.account))
  )
    throw new RangeError(
      "The account list changed or contains invalid accounts. Reload before saving.",
    );
  await prisma.$transaction(async (tx) => {
    const where = {
      dept_no: input.department,
      period_no: input.period,
      budget_key: BigInt(input.budgetId),
    };
    await tx.budget_pbalance.deleteMany({ where });
    const data = input.entries
      .filter((e) => e.amount !== null)
      .map((e) => ({
        ...where,
        acc_no: e.account,
        amount: ["RE", "OI"].includes(
          accounts.find((a) => a.acc_no === e.account)!.acc_type ?? "",
        )
          ? new Prisma.Decimal(e.amount!).negated()
          : new Prisma.Decimal(e.amount!),
      }));
    if (data.length) await tx.budget_pbalance.createMany({ data });
  });
}
