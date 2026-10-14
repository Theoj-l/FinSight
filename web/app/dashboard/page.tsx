import { getChartAnomaly } from "./data/anomalies";
import { previousCalendarMonths } from "./data/anomaly-evidence";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AppPage } from "@/app/components/app-page";
import {
  AnomaliesPanel,
  DashboardPanelLoading,
  ExpenseCategoryPanel,
  ExpenseByBusinessTypePanel,
  KpiPanel,
  ProfitLossPanel,
  ProfitMarginPanel,
  ProfitYoyComparisonPanel,
  RevenueByBusinessTypePanel,
  RevenueByGroupPanel,
  RevenueExpensePanel,
} from "./components/dashboard-panels";
import { DashboardFilters } from "./components/dashboard-filters";
import { getFilterOptions } from "./data/filter-options";
import { parseDashboardFilters, type FilterOptions, type SearchParams } from "./data/dashboard-scope";

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
  const params = await searchParams;
  const { selection, scope, error: selectionError } = parseDashboardFilters(params, optionsResult.options);
  const filterError = optionsResult.error ?? selectionError;
  const requested = typeof params.anomaly === "string" ? params.anomaly : undefined;
  const target = requested && !filterError ? await getChartAnomaly(requested, typeof params.reason === "string" ? params.reason : undefined).catch(() => null) : null;
  const focus = target && !scope.branchCodes?.length && scope.departmentIds?.length === 1 && scope.departmentIds[0] === target.alert.unitKey && scope.periodStart === target.alert.periodNo && scope.periodEnd === target.alert.periodNo ? target : null;
  const chartScope = focus ? { ...scope, trendPeriodNumbers: [...new Set([...previousCalendarMonths(focus.alert.periodNo), ...focus.finding.comparison.periods])].sort((a, b) => a - b) } : scope;


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
        {filterError ? null : <Suspense fallback={<DashboardPanelLoading label="KPI data" />}>
          <KpiPanel scope={scope} userId={user.id} />
        </Suspense>}

        {requested && !focus && <p role="status" className="mt-4 text-sm text-amber-900">This anomaly comparison is no longer available or does not match the selected reporting scope. Its chart highlight has been removed.</p>}
        {!filterError && <Suspense fallback={<DashboardPanelLoading label="anomaly results" />}><AnomaliesPanel scope={scope} /></Suspense>}

        {!filterError && <div className="mt-8">
          <Suspense fallback={<DashboardPanelLoading label="profit comparison data" />}>
            <ProfitYoyComparisonPanel scope={scope} />
          </Suspense>
        </div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <div className="h-full">
            {!filterError && <Suspense fallback={<DashboardPanelLoading label="financial data" />}>
              <RevenueExpensePanel scope={focus?.finding.chart === "revenue" ? chartScope : scope} focus={focus?.finding.chart === "revenue" ? focus : null} />
            </Suspense>}
          </div>
          <div className="h-full">
            {!filterError && <Suspense fallback={<DashboardPanelLoading label="profit data" />}>
              <ProfitMarginPanel scope={focus?.finding.chart === "gross" ? chartScope : scope} mode={focus?.finding.chart === "gross" || params.profitMode === "gross" ? "gross" : "net"} focus={focus?.finding.chart === "gross" ? focus : null} />
            </Suspense>}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="h-full">
            {!filterError && <Suspense fallback={<DashboardPanelLoading label="product group revenue" />}>
              <RevenueByGroupPanel scope={scope} />
            </Suspense>}
          </div>
          <div className="h-full">
            {!filterError && <Suspense fallback={<DashboardPanelLoading label="business type revenue" />}>
              <RevenueByBusinessTypePanel scope={scope} />
            </Suspense>}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="h-full">
            {!filterError && <Suspense fallback={<DashboardPanelLoading label="expense categories" />}>
              <ExpenseCategoryPanel scope={scope} />
            </Suspense>}
          </div>
          <div className="h-full">
            {!filterError && <Suspense fallback={<DashboardPanelLoading label="expense business types" />}>
              <ExpenseByBusinessTypePanel scope={scope} />
            </Suspense>}
          </div>
        </div>

        <div className="mt-8">
          {!filterError && <Suspense fallback={<DashboardPanelLoading label="profit and loss data" />}>
            <ProfitLossPanel scope={scope} />
          </Suspense>}
        </div>
        </DashboardFilters>
    </AppPage>
  );
}
