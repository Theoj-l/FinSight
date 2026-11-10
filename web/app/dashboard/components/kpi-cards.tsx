"use client";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { useCurrency } from "@/lib/currency-context";
import { comparisonKpis } from "@/lib/financial/presentation";
import { useFinancialComparison } from "@/app/components/financial/comparison-context";
import { AttentionSummary, HeadlineCard, RatioTile, referenceLabel } from "@/app/components/financial/kpi-card";
import { reportingMonth } from "@/app/home/overview-data";
import type { KpiData } from "../data/kpi-presentation";

export function KpiCards({
  data,
  error,
}: {
  data?: KpiData | null;
  error?: string;
  userId?: string;
}) {
  const context = useFinancialComparison();
  const fx = useCurrency();
  const current = context
    ? context.bundle && context.series
      ? comparisonKpis(context.bundle, context.source, context.series)
      : null
    : data;
  const message = context?.error ?? error;
  if (!current || message)
    return (
      <section
        aria-label="Financial overview"
        className="surface mt-8 rounded-2xl p-6"
      >
        <h2 className="text-lg font-semibold text-brand-navy">Financial overview</h2>
        <p role="status" className="mt-2 text-sm text-muted">
          {message ?? "No financial data is available."}
        </p>
      </section>
    );
  const reference = referenceLabel(current);
  const money = current.metrics.filter((m) => m.unit === "money" && m.id !== "budgetVariance");
  const ratios = current.metrics.filter((m) => m.unit === "ratio");
  return (
    <section aria-labelledby="kpi-heading" className="@container mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* Left padding keeps the walkthrough badge (top-left corner) off the heading text. */}
        <div className="pl-5">
          <h2 id="kpi-heading" className="text-xl font-semibold text-brand-navy">
            Financial overview
          </h2>
          <p className="mt-1 text-sm text-muted">
            {reportingMonth(current.period)} · compared with {reference} · {fx.currency}
          </p>
        </div>
        <Link
          href="/settings#thresholds"
          className="glass inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-brand-navy transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
        >
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          Threshold settings
        </Link>
      </div>
      <AttentionSummary metrics={current.metrics} />
      <div className="mt-4 grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-4">
        {money.map((metric) => (
          <HeadlineCard key={metric.id} metric={metric} reference={reference} fx={fx} period={reportingMonth(current.period)} />
        ))}
      </div>
      <h3 className="mt-6 pl-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Ratios</h3>
      <div className="mt-2 grid gap-3 @3xl:grid-cols-3">
        {ratios.map((metric) => (
          <RatioTile key={metric.id} metric={metric} reference={reference} period={reportingMonth(current.period)} />
        ))}
      </div>
      {current.notices.length > 0 && (
        <details className="mt-3 pl-1 text-xs text-muted">
          <summary className="cursor-pointer">
            Comparison availability and origin
          </summary>
          {current.notices.map((n, i) => (
            <p className="mt-2" key={i}>
              {n}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
