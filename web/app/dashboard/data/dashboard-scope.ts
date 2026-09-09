export type DashboardScope = {
  period?: number;
  departmentIds?: string[];
  branchCode?: string;
  budgetKey?: bigint;
};
export type FilterOptions = {
  periods: number[];
  units: { code: string; label: string }[];
  branches: { code: string; label: string }[];
};
export type FilterSelection = { period: string; unit: string; branch: string };
export type SearchParams = Record<string, string | string[] | undefined>;
export const BRANCH_LEDGER_MESSAGE = "Branch-level balances and budgets are not available yet. A verified link between branches and ledger entries is required. Select All Branches to view profit, costs and the P&L.";

export function parseDashboardFilters(params: SearchParams, options: FilterOptions): { selection: FilterSelection; scope: DashboardScope; error?: string } {
  const selection = {
    period: typeof params.period === "string" ? params.period : params.period === undefined ? String(options.periods[0] ?? "") : "",
    unit: typeof params.unit === "string" ? params.unit : "",
    branch: typeof params.branch === "string" ? params.branch : "",
  };
  const scope: DashboardScope = { period: Number(selection.period), ...(selection.unit ? { departmentIds: [selection.unit] } : {}), ...(selection.branch ? { branchCode: selection.branch } : {}) };
  let error: string | undefined;
  if ([params.period, params.unit, params.branch].some(Array.isArray)) error = "Select only one month, business unit and branch.";
  else if (!/^\d{6}$/.test(selection.period) || !options.periods.includes(scope.period!)) error = "The selected reporting month is unavailable. Choose a month from the list.";
  else if (selection.unit && !options.units.some(unit => unit.code === selection.unit)) error = "The selected business unit is unavailable. Choose a unit from the list.";
  else if (selection.branch && !options.branches.some(branch => branch.code === selection.branch)) error = "The selected branch is unavailable. Choose a branch from the list.";
  return { selection, scope, error };
}

export function ledgerDepartment(scope: DashboardScope) {
  // Invoice branch codes cannot attribute ledger expenses or budgets to branches.
  if (scope.branchCode) throw new Error(BRANCH_LEDGER_MESSAGE);
  return scope.departmentIds ? { dept_no: { in: scope.departmentIds } } : {};
}

export function invoiceWhere(scope: DashboardScope) {
  const period = scope.period;
  if (period !== undefined && (!Number.isInteger(period) || period < 100001 || period % 100 < 1 || period % 100 > 12)) throw new Error("Invalid reporting month");
  const year = period === undefined ? undefined : Math.floor(period / 100);
  const month = period === undefined ? undefined : period % 100;
  return {
    ...(scope.departmentIds ? { dept_no: { in: scope.departmentIds } } : {}),
    iv: { cancelled: false,
      ...(scope.branchCode ? { branch_code: scope.branchCode } : {}),
      ...(year !== undefined && month !== undefined ? { doc_date: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) } } : {}),
    },
  };
}
