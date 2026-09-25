import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AppPage } from "@/app/components/app-page";
import {
  DashboardPanelLoading,
  ExpenseCategoryPanel,
  KpiPanel,
  ProfitLossPanel,
  ProfitMarginPanel,
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
  const { selection, scope, error: selectionError } = parseDashboardFilters(await searchParams, optionsResult.options);
  const filterError = optionsResult.error ?? selectionError;

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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <div className="h-full">
            {!filterError && <Suspense fallback={<DashboardPanelLoading label="financial data" />}>
              <RevenueExpensePanel scope={scope} />
            </Suspense>}
          </div>
          <div className="h-full">
            {!filterError && <Suspense fallback={<DashboardPanelLoading label="profit data" />}>
              <ProfitMarginPanel scope={scope} />
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

        <div className="mt-8">
          <div className="h-full">
            {!filterError && <Suspense fallback={<DashboardPanelLoading label="expense categories" />}>
              <ExpenseCategoryPanel scope={scope} />
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
