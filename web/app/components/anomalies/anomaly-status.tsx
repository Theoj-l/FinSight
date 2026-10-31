import type { AnomalyStatus } from "@/app/dashboard/data/anomalies-utils";
import { formatPeriod } from "@/app/dashboard/data/revenue-expense-utils";
import { reportingMonth, timestamp } from "@/app/home/overview-data";

export function AnomalyStatusText({ status, error }: { status?: AnomalyStatus | null; error?: string }) {
  return <p className="text-xs leading-5 text-muted">{error ?? (!status ? "The anomaly model has not run yet." : `Model last run ${timestamp(status.scoredAt)} · results cover months up to ${status.scoredThrough ? reportingMonth(formatPeriod(status.scoredThrough)) : "the latest closed month"}.`)}</p>;
}
