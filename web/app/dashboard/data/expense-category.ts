import "server-only";

import { prisma } from "@/lib/db";
import { aggregateExpenseCategories, type ExpenseCategoryPeriod } from "./expense-category-utils";

export type { ExpenseCategoryPeriod } from "./expense-category-utils";

export async function getExpenseCategoryData(): Promise<ExpenseCategoryPeriod[]> {
  const rows = await prisma.pbalance.findMany({
    where: { gl_mast: { acc_type: "EX" } },
    orderBy: { period_no: "asc" },
    select: {
      period_no: true,
      home_dr: true,
      home_cr: true,
      gl_mast: { select: { description: true, acc_type: true } },
    },
  });

  return aggregateExpenseCategories(rows);
}