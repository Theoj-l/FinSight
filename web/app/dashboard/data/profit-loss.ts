import "server-only";

import { prisma } from "@/lib/db";
import { aggregateProfitLoss, type ProfitLossStatement } from "./profit-loss-utils";

export type { ProfitLossStatement } from "./profit-loss-utils";

export async function getProfitLossData(): Promise<ProfitLossStatement> {
  const formatRows = await prisma.pl_format.findMany({ orderBy: { seq: "asc" } });
  const latestPeriodRow = await prisma.pbalance.findFirst({ orderBy: { period_no: "desc" }, select: { period_no: true } });

  if (!latestPeriodRow) return { baseline: "MTD actual versus MTD budget", period: "", rows: [] };

  const actualRows = await prisma.pbalance.findMany({
    where: { period_no: { lte: latestPeriodRow.period_no } },
    select: {
      period_no: true,
      home_dr: true,
      home_cr: true,
      gl_mast: { select: { acc_type: true } },
    },
  });
  const budgetRows = await prisma.budget_pbalance.findMany({
    where: { period_no: latestPeriodRow.period_no },
    select: {
      period_no: true,
      amount: true,
      gl_mast: { select: { acc_type: true } },
    },
  });

  return aggregateProfitLoss(formatRows, actualRows, budgetRows, latestPeriodRow.period_no);
}