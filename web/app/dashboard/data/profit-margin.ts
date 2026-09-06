import "server-only";

import { prisma } from "@/lib/db";
import { selectLatestPeriods } from "./revenue-expense-utils";
import { aggregateProfitMargin, type ProfitBalanceRow, type ProfitMarginPoint } from "./profit-margin-utils";

export type { ProfitMarginPoint } from "./profit-margin-utils";

export async function getProfitMarginData(): Promise<ProfitMarginPoint[]> {
  const availablePeriods = await prisma.pbalance.findMany({
    distinct: ["period_no"],
    select: { period_no: true },
  });
  const periodNumbers = selectLatestPeriods(availablePeriods.map(({ period_no }) => period_no));

  if (periodNumbers.length === 0) return [];

  const rows = await prisma.pbalance.findMany({
    where: {
      period_no: { in: periodNumbers },
      gl_mast: { acc_type: { in: ["RE", "OI", "CS", "EX"] } },
    },
    select: {
      period_no: true,
      home_dr: true,
      home_cr: true,
      gl_mast: { select: { acc_type: true } },
    },
  });

  return aggregateProfitMargin(rows as ProfitBalanceRow[]);
}