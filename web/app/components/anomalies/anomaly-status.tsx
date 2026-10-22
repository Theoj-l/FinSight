import { FIRST_ANOMALY_PERIOD, type AnomalyStatus } from "@/app/dashboard/data/anomalies-utils";
import { formatPeriod } from "@/app/dashboard/data/revenue-expense-utils";
import { reportingMonth, timestamp } from "@/app/home/overview-data";

export function AnomalyStatusText({ status, error }: { status?: AnomalyStatus | null; error?: string }) {
  return <p className="text-xs leading-5 text-muted">{error ?? (!status ? "Anomaly data has not been checked yet." : `Last successfully checked ${timestamp(status.scoredAt)} · Checks start ${reportingMonth(formatPeriod(status.scoredFrom ?? FIRST_ANOMALY_PERIOD))} · Checked through ${status.scoredThrough ? reportingMonth(formatPeriod(status.scoredThrough)) : "no closed months"}.`)}</p>;
}
