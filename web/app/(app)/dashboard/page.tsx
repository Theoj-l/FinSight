import { FinancialComparisonBoundary } from "@/app/components/financial/comparison-boundary";
import { ComparisonSelector } from "@/app/components/financial/comparison-context";
import { getChartAnomaly } from "@/app/dashboard/data/anomalies";
import { previousCalendarMonths } from "@/app/dashboard/data/anomaly-evidence";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { TourTarget } from "@/app/components/tour/tour-target";
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
} from "@/app/dashboard/components/dashboard-panels";
import { DashboardFilters } from "@/app/dashboard/components/dashboard-filters";
import { getFilterOptions } from "@/app/dashboard/data/filter-options";
import {
  parseDashboardFilters,
  type FilterOptions,
  type SearchParams,
} from "@/app/dashboard/data/dashboard-scope";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // proxy.ts already guards this route; this is defence in depth.
  const user = await requireUser("/dashboard");
  const params = await searchParams;
  const requested =
    typeof params.anomaly === "string" ? params.anomaly : undefined;
  // Started now so it runs alongside the filter options; used only if they load.
  const pendingTarget = requested
    ? getChartAnomaly(
        requested,
        typeof params.reason === "string" ? params.reason : undefined,
      ).catch(() => null)
    : null;

  const optionsResult = await getFilterOptions(true)
    .then((options) => ({ options, error: undefined as string | undefined }))
    .catch((cause: unknown) => {
      console.error("Reporting filter load failed", {
        name: cause instanceof Error ? cause.name : "UnknownError",
      });
      return {
        options: { periods: [], units: [], branches: [] } as FilterOptions,
        error: "Reporting filters could not be loaded. Please retry.",
      };
    });
  const {
    selection,
    scope,
    error: selectionError,
  } = parseDashboardFilters(params, optionsResult.options);
  const filterError = optionsResult.error ?? selectionError;
  const target = pendingTarget && !filterError ? await pendingTarget : null;
  const focus =
    target &&
    !scope.branchCodes?.length &&
    scope.departmentIds?.length === 1 &&
    scope.departmentIds[0] === target.alert.unitKey &&
    scope.periodStart === target.alert.periodNo &&
    scope.periodEnd === target.alert.periodNo
      ? target
      : null;
  const chartScope = focus
    ? {
        ...scope,
        trendPeriodNumbers: [
          ...new Set([
            ...previousCalendarMonths(focus.alert.periodNo),
            ...focus.finding.comparison.periods,
          ]),
        ].sort((a, b) => a - b),
      }
    : scope;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-blue">
            Financial command centre
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            A live view of performance across TSH Group.
          </p>
        </div>
        {!filterError && (
          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
            Reporting filters loaded
          </div>
        )}
      </div>

      <FinancialComparisonBoundary scope={filterError ? null : chartScope}>
        <DashboardFilters
          key={JSON.stringify(selection)}
          options={optionsResult.options}
          selection={selection}
          error={filterError}
        >
          {!filterError && (
            <TourTarget id="comparison-source">
              <Suspense fallback={<div role="status" aria-label="Loading comparison sources" className="mt-5 h-28 animate-pulse rounded-xl border border-brand-navy/15 bg-white" />}>
                <ComparisonSelector />
              </Suspense>
            </TourTarget>
          )}
          {filterError ? null : (
            <Suspense fallback={<DashboardPanelLoading label="KPI data" />}>
              <TourTarget id="kpi-cards">
                <KpiPanel scope={scope} userId={user.id} />
              </TourTarget>
            </Suspense>
          )}

          {requested && !focus && (
            <p role="status" className="mt-4 text-sm text-amber-900">
              This anomaly comparison is no longer available or does not match
              the selected reporting scope. Its chart highlight has been
              removed.
            </p>
          )}
          {!filterError && (
            <Suspense
              fallback={<DashboardPanelLoading label="anomaly results" />}
            >
              <TourTarget id="anomalies">
                <AnomaliesPanel scope={scope} />
              </TourTarget>
            </Suspense>
          )}

          {!filterError && (
            <TourTarget id="profit-yoy" className="mt-8">
              <Suspense
                fallback={
                  <DashboardPanelLoading label="profit comparison data" />
                }
              >
                <ProfitYoyComparisonPanel scope={scope} />
              </Suspense>
            </TourTarget>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            <div className="h-full">
              {!filterError && (
                <TourTarget id="revenue-vs-expenses" className="h-full">
                  <Suspense
                    fallback={<DashboardPanelLoading label="financial data" />}
                  >
                    <RevenueExpensePanel
                      scope={
                        focus?.finding.chart === "revenue" ? chartScope : scope
                      }
                      focus={focus?.finding.chart === "revenue" ? focus : null}
                    />
                  </Suspense>
                </TourTarget>
              )}
            </div>
            <div className="h-full">
              {!filterError && (
                <TourTarget id="profit-margin" className="h-full">
                  <Suspense
                    fallback={<DashboardPanelLoading label="profit data" />}
                  >
                    <ProfitMarginPanel
                      scope={
                        focus?.finding.chart === "gross" ? chartScope : scope
                      }
                      mode={
                        focus?.finding.chart === "gross" ||
                        params.profitMode === "gross"
                          ? "gross"
                          : "net"
                      }
                      focus={focus?.finding.chart === "gross" ? focus : null}
                    />
                  </Suspense>
                </TourTarget>
              )}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="h-full">
              {!filterError && (
                <TourTarget id="revenue-by-group" className="h-full">
                  <Suspense
                    fallback={
                      <DashboardPanelLoading label="product group revenue" />
                    }
                  >
                    <RevenueByGroupPanel scope={scope} />
                  </Suspense>
                </TourTarget>
              )}
            </div>
            <div className="h-full">
              {!filterError && (
                <TourTarget id="revenue-by-business-type" className="h-full">
                  <Suspense
                    fallback={
                      <DashboardPanelLoading label="business type revenue" />
                    }
                  >
                    <RevenueByBusinessTypePanel scope={scope} />
                  </Suspense>
                </TourTarget>
              )}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="h-full">
              {!filterError && (
                <TourTarget id="expense-by-category" className="h-full">
                  <Suspense
                    fallback={
                      <DashboardPanelLoading label="expense categories" />
                    }
                  >
                    <ExpenseCategoryPanel scope={scope} />
                  </Suspense>
                </TourTarget>
              )}
            </div>
            <div className="h-full">
              {!filterError && (
                <TourTarget id="expense-by-business-type" className="h-full">
                  <Suspense
                    fallback={
                      <DashboardPanelLoading label="expense business types" />
                    }
                  >
                    <ExpenseByBusinessTypePanel scope={scope} />
                  </Suspense>
                </TourTarget>
              )}
            </div>
          </div>

          <div className="mt-8">
            {!filterError && (
              <TourTarget id="profit-loss">
                <Suspense
                  fallback={
                    <DashboardPanelLoading label="profit and loss data" />
                  }
                >
                  <ProfitLossPanel scope={scope} />
                </Suspense>
              </TourTarget>
            )}
          </div>
        </DashboardFilters>
      </FinancialComparisonBoundary>
    </>
  );
}
