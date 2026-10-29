import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/require-user";
import { getAnomalyAlerts, getAnomalyStatus } from "@/app/dashboard/data/anomalies";
import { getFinancialBundle } from "@/lib/financial/data";
import { comparisonKpis } from "@/lib/financial/presentation";
import { HomeOverview } from "@/app/home/home-overview";

export const metadata: Metadata = {
  title: "Home | FinSight",
  description: "Financial performance, attention alerts and your FinSight workspace.",
};

export default async function HomePage() {
  const user = await requireUser("/home");
  const [result, anomalyResult] = await Promise.all([getFinancialBundle()
    .then(bundle => ({ data: bundle ? comparisonKpis(bundle, bundle.notificationSource, bundle.notificationSource === "budget" && bundle.notificationBudgetId ? bundle.budgetSources[bundle.notificationBudgetId] : undefined) : null, error: undefined }))
    .catch(() => ({ data: null, error: "Financial data could not be loaded. Refresh to try again." })),
    (async () => {
      const status = await getAnomalyStatus();
      const alerts = status?.scoredThrough ? await getAnomalyAlerts({ periodStart: status.scoredThrough, periodEnd: status.scoredThrough }) : [];
      return { status, alerts, error: undefined as string | undefined };
    })().catch(() => ({ status: null, alerts: [], error: "Anomaly results could not be loaded. Refresh to retry." })),
  ]);

  return (
    <HomeOverview userId={user.id} data={result.data} error={result.error} loadedAt={new Date().toISOString()} anomalyResult={anomalyResult} />
  );
}
