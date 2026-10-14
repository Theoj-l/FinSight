import type { Metadata } from "next";
import { AppPage } from "@/app/components/app-page";
import { requireUser } from "@/lib/auth/require-user";
import { getAnomalyAlerts, getAnomalyStatus } from "@/app/dashboard/data/anomalies";
import { getKpiData } from "@/app/dashboard/data/kpi";
import { HomeOverview } from "./home-overview";

export const metadata: Metadata = {
  title: "Home | FinSight",
  description: "Financial performance, attention alerts and your FinSight workspace.",
};

export default async function HomePage() {
  const user = await requireUser("/home");
  const [result, anomalyResult] = await Promise.all([getKpiData()
    .then(data => ({ data, error: undefined }))
    .catch(() => ({ data: null, error: "Financial data could not be loaded. Refresh to try again." })),
    (async () => {
      const status = await getAnomalyStatus();
      const alerts = status?.scoredThrough ? await getAnomalyAlerts({ periodStart: status.scoredThrough, periodEnd: status.scoredThrough }) : [];
      return { status, alerts, error: undefined as string | undefined };
    })().catch(() => ({ status: null, alerts: [], error: "Anomaly results could not be loaded. Refresh to retry." })),
  ]);

  return (
    <AppPage email={user.email ?? "Finance user"}>
      <HomeOverview userId={user.id} data={result.data} error={result.error} loadedAt={new Date().toISOString()} anomalyResult={anomalyResult} />
    </AppPage>
  );
}
