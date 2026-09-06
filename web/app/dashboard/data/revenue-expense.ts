import "server-only";

import { prisma } from "@/lib/db";
import { aggregateRevenueExpense, selectLatestPeriods } from "./revenue-expense-utils";
import type { RevenueExpensePoint } from "./revenue-expense-utils";

export type { RevenueExpensePoint } from "./revenue-expense-utils";

export async function getRevenueExpenseData(): Promise<RevenueExpensePoint[]> {
  const availablePeriods = await prisma.pbalance.findMany({
    distinct: ["period_no"],
    select: { period_no: true },
  });
  const periodNumbers = selectLatestPeriods(availablePeriods.map(({ period_no }) => period_no));

  if (periodNumbers.length === 0) return [];

  const rows = await prisma.pbalance.findMany({
    where: {
      period_no: { in: periodNumbers },
      gl_mast: { acc_type: { in: ["RE", "EX"] } },
    },
    select: {
      period_no: true,
      home_dr: true,
      home_cr: true,
      gl_mast: { select: { acc_type: true } },
    },
  });

  return aggregateRevenueExpense(rows);
}