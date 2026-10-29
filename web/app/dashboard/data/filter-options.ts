import "server-only";
import { prisma } from "@/lib/db";
import type { FilterOptions } from "./dashboard-scope";

type Period = { period_no: number };

export async function getFilterOptions(includePlans = false): Promise<FilterOptions> {
  // SQL DISTINCT, not findMany({ distinct }): Prisma applies `distinct` after
  // fetching every row (16k+ forecast rows for ~40 months). All six reads run
  // in one parallel batch.
  const optional = (read: () => Promise<Period[]>) => includePlans ? Promise.resolve().then(read).catch(() => []) : Promise.resolve([]);
  const [periods, units, branches, ...planned] = await Promise.all([
    prisma.$queryRaw<Period[]>`SELECT DISTINCT period_no FROM pbalance ORDER BY period_no DESC`,
    prisma.dept.findMany({ select: { dept_no: true, description: true, segment: true }, orderBy: { dept_no: "asc" } }),
    // Include inactive branches so historical reports remain accessible.
    prisma.branch.findMany({ select: { branch_code: true, branch_name: true }, orderBy: { branch_code: "asc" } }),
    optional(() => prisma.$queryRaw<Period[]>`SELECT DISTINCT f.period_no FROM forecast_value f JOIN forecast_run r ON r.run_id = f.run_id WHERE r.status = 'ok'`),
    optional(() => prisma.$queryRaw<Period[]>`SELECT DISTINCT period_no FROM financial_manual_forecast`),
    optional(() => prisma.$queryRaw<Period[]>`SELECT DISTINCT period_no FROM budget_pbalance`),
  ]);
  return {
    periods: [...new Set([...periods, ...planned.flat()].map(row => row.period_no))].filter(p => p >= 100001 && p <= 999912 && p % 100 >= 1 && p % 100 <= 12).sort((a, b) => b - a),
    ...(includePlans && periods.length ? { defaultPeriod: periods[0].period_no } : {}),
    units: units.map(row => ({ code: row.dept_no, businessType: row.segment, label: row.description ? `${row.description} (${row.dept_no})` : row.dept_no })),
    branches: branches.map(row => ({ code: row.branch_code, label: row.branch_name ? `${row.branch_name} (${row.branch_code})` : row.branch_code })),
  };
}
