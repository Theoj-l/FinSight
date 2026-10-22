import type { ChartAnomaly } from "../data/anomaly-evidence";
import { getAnomalyAlerts, getAnomalyStatus } from "../data/anomalies";
import { AnomalyPanel } from "./anomaly-panel";
import { ExpenseCategoryChart } from "./expense-category-chart";
import { ExpenseByBusinessTypeChart } from "./expense-by-business-type-chart";
import { KpiCards } from "./kpi-cards";
import { ProfitLossTable } from "./profit-loss-table";
import { ProfitMarginChart } from "./profit-margin-chart";
import { ProfitYoyComparisonChart } from "./profit-yoy-comparison-chart";
import { RevenueByGroupChart } from "./revenue-by-group-chart";
import { RevenueByBusinessTypeChart } from "./revenue-by-business-type-chart";
import { RevenueExpenseChart } from "./revenue-expense-chart";
import { getExpenseCategoryData } from "../data/expense-category";
import { getExpenseByBusinessTypeData } from "../data/expense-by-business-type";
import { getProfitMarginData } from "../data/profit-margin";
import { getProfitYoyComparisonData } from "../data/profit-yoy-comparison";
import { getRevenueByGroupData } from "../data/revenue-by-group";
import { getRevenueByBusinessTypeData } from "../data/revenue-by-business-type";
import { getRevenueExpenseData } from "../data/revenue-expense";
import { BRANCH_LEDGER_MESSAGE, type DashboardScope } from "../data/dashboard-scope";
import { ActualOnlyComparisonNote } from "@/app/components/financial/comparison-context";

export function DashboardPanelLoading({ label }: { label: string }) {
  if (label === "KPI data") {
    return (
      <section className="mt-8" role="status" aria-label="Loading KPI data">
        <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map(item => (
            <div key={item} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="h-3 w-28 rounded bg-slate-100" />
              <div className="mt-5 h-7 w-36 rounded bg-slate-200" />
              <div className="mt-4 h-3 w-24 rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading KPI data</span>
      </section>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm" role="status" aria-label={`Loading ${label}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-8 w-20 animate-pulse rounded-lg bg-slate-100" />
      </div>
      <div className="mt-5 h-48 animate-pulse rounded-lg bg-gradient-to-br from-slate-50 via-blue-50/50 to-slate-50" />
      <div className="mt-5 flex items-center gap-3">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
      </div>
      <span className="sr-only">Loading {label}</span>
    </div>
  );
}

export function KpiPanel({ userId }: { scope: DashboardScope; userId: string }) {
  return <KpiCards userId={userId} />;
}

export async function RevenueExpensePanel({ scope, focus }: { scope: DashboardScope; focus?: ChartAnomaly | null }) {
  let data;
  let error;
  try {
    data = await getRevenueExpenseData(scope);
  } catch {
    error = "Financial data could not be loaded right now.";
  }
  return <RevenueExpenseChart data={data} error={error} focus={focus} />;
}

export async function ProfitMarginPanel({ scope, mode, focus }: { scope: DashboardScope; mode?: "net" | "gross"; focus?: ChartAnomaly | null }) {
  let data;
  let error;
  try {
    data = await getProfitMarginData(scope);
  } catch {
    error = "Profit data could not be loaded right now.";
  }

  return <ProfitMarginChart data={data} error={error} mode={mode} focus={focus} />;
}

export async function ProfitYoyComparisonPanel({ scope }: { scope: DashboardScope }) {
  let data;
  let error;
  try {
    data = await getProfitYoyComparisonData(scope);
  } catch (cause) {
    error = cause instanceof Error && cause.message === BRANCH_LEDGER_MESSAGE
      ? BRANCH_LEDGER_MESSAGE
      : "Profit comparison data could not be loaded right now. Please refresh to retry.";
  }
  return <div><ProfitYoyComparisonChart data={data} error={error} /><ActualOnlyComparisonNote>This view retains its actual year-over-year comparison. The selected reference appears in the profit-and-margin chart.</ActualOnlyComparisonNote></div>;
}

export async function RevenueByGroupPanel({ scope }: { scope: DashboardScope }) {
  let data;
  let error;
  try {
    data = await getRevenueByGroupData(scope);
  } catch {
    error = "Product group revenue could not be loaded right now.";
  }
  return <div><RevenueByGroupChart data={data} error={error} /><ActualOnlyComparisonNote>Actual invoice breakdown only. Ledger plans and forecasts do not provide matching product-group estimates.</ActualOnlyComparisonNote></div>;
}

export async function RevenueByBusinessTypePanel({ scope }: { scope: DashboardScope }) {
  let data;
  let error;
  try {
    data = await getRevenueByBusinessTypeData(scope);
  } catch {
    error = "Business type revenue could not be loaded right now.";
  }
  return <div><RevenueByBusinessTypeChart data={data} error={error} /><ActualOnlyComparisonNote>Actual invoice breakdown only. Use the Business type filter to compare group revenue in the main chart.</ActualOnlyComparisonNote></div>;
}

export async function ExpenseCategoryPanel({ scope }: { scope: DashboardScope }) {
  let data;
  let error;
  try {
    data = await getExpenseCategoryData(scope);
  } catch {
    error = "Expense category data could not be loaded right now.";
  }

  return <div><ExpenseCategoryChart data={data} error={error} /><ActualOnlyComparisonNote>Actual account breakdown only. Shared comparisons use aggregate operating expenses; no category forecast is inferred.</ActualOnlyComparisonNote></div>;
}

export async function ExpenseByBusinessTypePanel({ scope }: { scope: DashboardScope }) {
  let data;
  let error;
  try {
    data = await getExpenseByBusinessTypeData(scope);
  } catch {
    error = "Expense business type data could not be loaded right now.";
  }
  return <div><ExpenseByBusinessTypeChart data={data} error={error} /><ActualOnlyComparisonNote>Actual expense breakdown only. Use the Business type filter for group comparisons. Operating-expense forecasts are unavailable.</ActualOnlyComparisonNote></div>;
}

export function ProfitLossPanel({ scope }: { scope: DashboardScope }) {
  return <ProfitLossTable error={scope.branchCodes?.length ? BRANCH_LEDGER_MESSAGE : undefined} />;
}

export async function AnomaliesPanel({ scope }: { scope: DashboardScope }) {
  const branch = !!(scope.branchCode || scope.branchCodes?.length);
  let alerts: Awaited<ReturnType<typeof getAnomalyAlerts>> = [];
  let status: Awaited<ReturnType<typeof getAnomalyStatus>> = null;
  let error: string | undefined;
  try {
    [alerts, status] = await Promise.all([
      branch ? Promise.resolve([]) : getAnomalyAlerts({ periodStart: scope.periodStart ?? scope.period, periodEnd: scope.periodEnd ?? scope.period, departmentIds: scope.departmentIds }),
      getAnomalyStatus(),
    ]);
  } catch {
    error = "Anomaly checks are unavailable.";
  }
  return <AnomalyPanel alerts={alerts.sort((a, b) => b.score - a.score)} status={status} error={error} periodStart={scope.periodStart ?? scope.period} periodEnd={scope.periodEnd ?? scope.period} branch={branch} />;
}
