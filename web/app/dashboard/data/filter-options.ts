import "server-only";
import { prisma } from "@/lib/db";
import type { FilterOptions } from "./dashboard-scope";

export async function getFilterOptions(): Promise<FilterOptions> {
  const [periods, units, branches] = await Promise.all([
    prisma.pbalance.findMany({ distinct: ["period_no"], select: { period_no: true }, orderBy: { period_no: "desc" } }),
    prisma.dept.findMany({ select: { dept_no: true, description: true }, orderBy: { dept_no: "asc" } }),
    // Include inactive branches so historical reports remain accessible.
    prisma.branch.findMany({ select: { branch_code: true, branch_name: true }, orderBy: { branch_code: "asc" } }),
  ]);
  return {
    periods: periods.map(row => row.period_no).filter(p => p >= 100001 && p <= 999912 && p % 100 >= 1 && p % 100 <= 12),
    units: units.map(row => ({ code: row.dept_no, label: row.description ? `${row.description} (${row.dept_no})` : row.dept_no })),
    branches: branches.map(row => ({ code: row.branch_code, label: row.branch_name ? `${row.branch_name} (${row.branch_code})` : row.branch_code })),
  };
}
