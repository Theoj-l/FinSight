import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeading } from "@/app/components/app-page";
import { requireUser } from "@/lib/auth/require-user";
import { DashboardFilters } from "@/app/dashboard/components/dashboard-filters";
import { getFilterOptions } from "@/app/dashboard/data/filter-options";
import { getForecast } from "@/app/dashboard/data/forecast";
import { BRANCH_LEDGER_MESSAGE, parseDashboardFilters, type FilterOptions, type SearchParams } from "@/app/dashboard/data/dashboard-scope";
import { ForecastView } from "@/app/forecast/components/forecast-view";
import { ForecastLoading } from "@/app/forecast/components/forecast-loading";

export const metadata: Metadata = {
  title: "Forecast | FinSight",
  description: "Compare financial actuals with forward-looking projections for TSH Group.",
};

export default async function ForecastPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser("/forecast");

  const optionsResult = await getFilterOptions()
    .then(options => ({ options, error: undefined as string | undefined }))
    .catch((cause: unknown) => { console.error("Reporting filter load failed", { name: cause instanceof Error ? cause.name : "UnknownError" }); return { options: { periods: [], units: [], branches: [] } as FilterOptions, error: "Reporting filters could not be loaded. Please retry." }; });
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
    <>
      <PageHeading eyebrow="Decision support" title="Forecast" description="Compare closed-month performance with forward-looking projections for the selected reporting scope." />
      <DashboardFilters key={JSON.stringify(selection)} destination="/forecast" tourId="forecast-filters" hidePeriod options={optionsResult.options} selection={selection} error={filterError}>
        {filterError ? null : <Suspense fallback={<ForecastLoading />}><ForecastPanel scope={scope} /></Suspense>}
      </DashboardFilters>
    </>
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
  return <>{data.coverageWarning && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{data.coverageWarning}</p>}<ForecastView data={data} /></>;
}

function EmptyForecast() {
  return <section className="surface mt-8 rounded-2xl border-dashed p-10 text-center"><h2 className="text-lg font-semibold text-brand-navy">Forecasts are not available yet</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">A forecast will appear here after the first successful forecast run. Historical dashboard reporting remains available in the meantime.</p></section>;
}
