export type DashboardScope = {
  period?: number;
  periodNumbers?: number[];
  trendPeriodNumbers?: number[];
  periodStart?: number;
  periodEnd?: number;
  departmentIds?: string[];
  branchCodes?: string[];
  branchCode?: string;
  budgetKey?: bigint;
};
export type FilterOptions = {
  periods: number[];
  units: { code: string; label: string }[];
  branches: { code: string; label: string }[];
};
export type FilterSelection = { periodStart: string; periodEnd: string; units: string[]; branches: string[] };
export type SearchParams = Record<string, string | string[] | undefined>;
export const BRANCH_LEDGER_MESSAGE = "Branch-level balances and budgets are not available yet. A verified link between branches and ledger entries is required. Select All Branches to view profit, costs and the P&L.";

export function parseDashboardFilters(params: SearchParams, options: FilterOptions): { selection: FilterSelection; scope: DashboardScope; error?: string } {
  const values = (value: string | string[] | undefined) => value === undefined ? [] : Array.isArray(value) ? value : [value];
  const periodStart = typeof params.periodStart === "string" ? params.periodStart : typeof params.period === "string" ? params.period : String(options.periods[0] ?? "");
  const periodEnd = typeof params.periodEnd === "string" ? params.periodEnd : periodStart;
  const units = values(params.unit).filter(Boolean);
  const branches = values(params.branch).filter(Boolean);
  const selection = {
    periodStart,
    periodEnd,
    units,
    branches,
  };
  const start = Number(periodStart);
  const end = Number(periodEnd);
  const periodNumbers = options.periods.filter(period => period >= Math.min(start, end) && period <= Math.max(start, end)).sort((first, second) => first - second);
  const scope: DashboardScope = {
    period: end,
    periodStart: start,
    periodEnd: end,
    periodNumbers,
    trendPeriodNumbers: start === end ? options.periods.filter(period => period <= end).slice(0, 6).sort((first, second) => first - second) : periodNumbers,
    ...(units.length ? { departmentIds: units } : {}),
    ...(branches.length ? { branchCodes: branches, branchCode: branches[0] } : {}),
  };
  let error: string | undefined;
  const suppliedPeriods = [params.period, params.periodStart, params.periodEnd].flatMap(values);
  if (Array.isArray(params.period) || suppliedPeriods.some(value => !/^\d{6}$/.test(value))) error = "The selected reporting month is unavailable. Choose a month from the list.";
  else if (!options.periods.includes(start) || !options.periods.includes(end) || start > end || periodNumbers.length === 0) error = "The selected reporting period is unavailable. Choose a period from the list.";
  else if (units.some(unit => !options.units.some(option => option.code === unit))) error = "The selected business unit is unavailable. Choose a unit from the list.";
  else if (branches.some(branch => !options.branches.some(option => option.code === branch))) error = "The selected branch is unavailable. Choose a branch from the list.";
  return { selection, scope, error };
}

export function ledgerDepartment(scope: DashboardScope) {
  // Invoice branch codes cannot attribute ledger expenses or budgets to branches.
  if (scope.branchCode || scope.branchCodes?.length) throw new Error(BRANCH_LEDGER_MESSAGE);
  return scope.departmentIds ? { dept_no: { in: scope.departmentIds } } : {};
}

export function invoiceWhere(scope: DashboardScope) {
  const start = scope.periodStart ?? scope.period;
  const end = scope.periodEnd ?? scope.period;
  const validatePeriod = (period: number | undefined) => period !== undefined && (!Number.isInteger(period) || period < 100001 || period % 100 < 1 || period % 100 > 12);
  if (validatePeriod(start) || validatePeriod(end)) throw new Error("Invalid reporting month");
  const startYear = start === undefined ? undefined : Math.floor(start / 100);
  const startMonth = start === undefined ? undefined : start % 100;
  const endYear = end === undefined ? undefined : Math.floor(end / 100);
  const endMonth = end === undefined ? undefined : end % 100;
  return {
    ...(scope.departmentIds ? { dept_no: { in: scope.departmentIds } } : {}),
    iv: { cancelled: false,
      ...(scope.branchCodes?.length ? { branch_code: { in: scope.branchCodes } } : scope.branchCode ? { branch_code: scope.branchCode } : {}),
      ...(startYear !== undefined && startMonth !== undefined && endYear !== undefined && endMonth !== undefined ? { doc_date: { gte: new Date(Date.UTC(startYear, startMonth - 1, 1)), lt: new Date(Date.UTC(endYear, endMonth, 1)) } } : {}),
    },
  };
}
