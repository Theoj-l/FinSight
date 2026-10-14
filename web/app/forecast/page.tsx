import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppPage, PageHeading } from "@/app/components/app-page";
import { createClient } from "@/lib/supabase/server";
import { DashboardFilters } from "@/app/dashboard/components/dashboard-filters";
import { getFilterOptions } from "@/app/dashboard/data/filter-options";
import { getForecast } from "@/app/dashboard/data/forecast";
import { BRANCH_LEDGER_MESSAGE, parseDashboardFilters, type FilterOptions, type SearchParams } from "@/app/dashboard/data/dashboard-scope";
import { ForecastView } from "./components/forecast-view";
import { ForecastLoading } from "./components/forecast-loading";

export const metadata: Metadata = {
  title: "Forecast | FinSight",
  description: "Compare financial actuals with forward-looking projections for TSH Group.",
};

export default async function ForecastPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/forecast");

  const optionsResult = await getFilterOptions()
    .then(options => ({ options, error: undefined as string | undefined }))
    .catch(() => ({ options: { periods: [], units: [], branches: [] } as FilterOptions, error: "Reporting filters could not be loaded. Please refresh to retry." }));
  const { selection, scope: parsedScope, error: selectionError } = parseDashboardFilters(await searchParams, optionsResult.options);
  const scope = {
    ...parsedScope,
    period: undefined,
    periodStart: undefined,
    periodEnd: undefined,
    periodNumbers: undefined,
    trendPeriodNumbers: undefined,
  };
  const filterError = optionsResult.error ?? selectionError;

  return (
    <AppPage email={user.email ?? "Finance user"}>
      <PageHeading eyebrow="Decision support" title="Forecast" description="Compare closed-month performance with forward-looking projections for the selected reporting scope." />
      <DashboardFilters destination="/forecast" hidePeriod options={optionsResult.options} selection={selection} error={filterError}>
        {filterError ? null : <Suspense fallback={<ForecastLoading />}><ForecastPanel scope={scope} /></Suspense>}
      </DashboardFilters>
    </AppPage>
  );
}

async function ForecastPanel({ scope }: { scope: Parameters<typeof getForecast>[0] }) {
  let data;
  let error: string | undefined;
  try {
    data = await getForecast(scope);
  } catch (cause) {
    error = cause instanceof Error && cause.message === BRANCH_LEDGER_MESSAGE
      ? BRANCH_LEDGER_MESSAGE
      : "Forecast data could not be loaded right now. Please refresh to retry.";
  }
  if (error) return <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-brand-red" role="alert">{error}</div>;
  if (!data) return <EmptyForecast />;
  return <ForecastView data={data} />;
}

function EmptyForecast() {
  return <section className="mt-8 rounded-xl border border-dashed border-brand-navy/20 bg-white p-10 text-center"><h2 className="text-lg font-semibold text-brand-navy">Forecasts are not available yet</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">A forecast will appear here after the first successful forecast run. Historical dashboard reporting remains available in the meantime.</p></section>;
}
