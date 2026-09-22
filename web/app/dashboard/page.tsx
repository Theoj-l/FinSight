import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppPage } from "@/app/components/app-page";
import { RevenueExpenseChart } from "./components/revenue-expense-chart";
import { ProfitMarginChart } from "./components/profit-margin-chart";
import { RevenueByGroupChart } from "./components/revenue-by-group-chart";
import { ProfitLossTable } from "./components/profit-loss-table";
import { getRevenueExpenseData } from "./data/revenue-expense";
import { getProfitMarginData } from "./data/profit-margin";
import { getRevenueByGroupData } from "./data/revenue-by-group";
import { getProfitLossData } from "./data/profit-loss";
import { getKpiData } from "./data/kpi";
import { KpiCards } from "./components/kpi-cards";
import { DashboardFilters } from "./components/dashboard-filters";
import { getFilterOptions } from "./data/filter-options";
import { BRANCH_LEDGER_MESSAGE, parseDashboardFilters, type FilterOptions, type SearchParams } from "./data/dashboard-scope";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already guards this route; this is defence in depth.
  if (!user) redirect("/login?next=/dashboard");

  const optionsResult = await getFilterOptions()
    .then(options => ({ options, error: undefined as string | undefined }))
    .catch(() => ({ options: { periods: [], units: [], branches: [] } as FilterOptions, error: "Reporting filters could not be loaded. Please refresh to retry." }));
  const { selection, scope, error: selectionError } = parseDashboardFilters(await searchParams, optionsResult.options);
  const filterError = optionsResult.error ?? selectionError;
  async function load<T>(read: () => Promise<T>, message: string, ledger = true): Promise<{ data?: T; error?: string }> {
    if (filterError) return { error: filterError };
    if (ledger && scope.branchCode) return { error: BRANCH_LEDGER_MESSAGE };
    try { return { data: await read() }; } catch { return { error: message }; }
  }

  const [
    revenueExpenseResult,
    profitMarginResult,
    revenueByGroupResult,
    profitLossResult,
    kpiResult,
  ] = await Promise.all([
    load(() => getRevenueExpenseData(scope), "Financial data could not be loaded right now."),
    load(() => getProfitMarginData(scope), "Profit data could not be loaded right now."),
    load(() => getRevenueByGroupData(scope), "Product group revenue could not be loaded right now.", false),
    load(() => getProfitLossData(scope), "Profit and loss data could not be loaded right now."),
    load(() => getKpiData(scope), "KPI data could not be loaded right now. Please refresh to retry."),
  ]);

  const chartData = revenueExpenseResult.data;
  const chartError = revenueExpenseResult.error;
  const profitMarginData = profitMarginResult.data;
  const profitMarginError = profitMarginResult.error;
  const revenueByGroupData = revenueByGroupResult.data;
  const revenueByGroupError = revenueByGroupResult.error;
  const profitLossData = profitLossResult.data;
  const profitLossError = profitLossResult.error;

  return (
    <AppPage email={user.email ?? "Finance user"}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-blue">Financial command centre</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">Dashboard</h1>
            <p className="mt-1.5 text-sm text-muted">A live view of performance across TSH Group.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
            Data refreshed today
          </div>
        </div>


        <DashboardFilters key={JSON.stringify(selection)} options={optionsResult.options} selection={selection} error={filterError}>
        <KpiCards data={kpiResult.data} error={kpiResult.error} userId={user.id} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <div className="h-full">
            <RevenueExpenseChart data={chartData} error={chartError} />
          </div>
          <div className="h-full">
            <ProfitMarginChart data={profitMarginData} error={profitMarginError} />
          </div>
        </div>

        <div className="mt-8">
          <div className="h-full">
            <RevenueByGroupChart data={revenueByGroupData} error={revenueByGroupError} />
          </div>
        </div>

        <div className="mt-8">
          <ProfitLossTable data={profitLossData} error={profitLossError} />
        </div>
        </DashboardFilters>
    </AppPage>
  );
}
