import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ClassificationResult } from "@/lib/types/classification";
import { resolveFilters } from "../filter-builder";
import { resolvePeriod, toPeriodInfo } from "../period-resolver";
import type {
  AnomalyAnalysisResult,
  AnomalyResultItem,
  ForecastAnalysisResult,
  ForecastResultItem,
  ModelRunInfo,
} from "../types";

type AnomalyQuestion = AnomalyAnalysisResult["questionType"];
type ForecastQuestion = ForecastAnalysisResult["questionType"];

function stringsFromJson(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function anomalyAction(kind: string, label: string): string {
  if (kind === "acc") return `Review postings and supporting documents for ${label}`;
  if (kind === "cust") return `Review collection history and open invoices for ${label}`;
  return `Review revenue, cost, margin, and unusual postings for ${label}`;
}

export async function getAnomalyAnalysis(
  classification: ClassificationResult
): Promise<AnomalyAnalysisResult> {
  const questionType = classification.question_type as AnomalyQuestion;
  const period = await resolvePeriod(classification.period ?? "last_month");
  if (!period) throw new Error("Could not resolve anomaly period.");
  const filters = await resolveFilters(classification);

  const conditions: Prisma.Sql[] = [
    Prisma.sql`a.period_no IN (${Prisma.join(period.periodNos)})`,
  ];
  if (classification.metric === "operating_expense") {
    conditions.push(Prisma.sql`a.unit_kind = 'acc'`);
  }
  if (filters.deptNos?.length) {
    conditions.push(
      Prisma.sql`a.unit_kind = 'dept' AND a.unit_key IN (${Prisma.join(filters.deptNos)})`
    );
  }
  if (filters.debtorCodes?.length) {
    conditions.push(
      Prisma.sql`a.unit_kind = 'cust' AND a.unit_key IN (${Prisma.join(filters.debtorCodes)})`
    );
  }
  const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

  const rows = await prisma.$queryRaw<
    {
      unit_kind: "dept" | "acc" | "cust";
      unit_key: string;
      unit_label: string;
      period_no: number;
      score: number;
      reasons: unknown;
      observed_amount: number | null;
      first_flagged_at: Date;
      run_id: bigint;
      model_version: string;
      finished_at: Date | null;
      data_through: number | null;
    }[]
  >`
    WITH latest_ok_run AS (
      SELECT run_id, model_version, finished_at, data_through
      FROM anomaly_run
      WHERE status = 'ok'
      ORDER BY run_id DESC
      LIMIT 1
    )
    SELECT
      a.unit_kind,
      a.unit_key,
      COALESCE(
        CASE WHEN a.unit_kind = 'dept' THEN d.description END,
        CASE WHEN a.unit_kind = 'acc' THEN gm_label.description END,
        CASE WHEN a.unit_kind = 'cust' THEN db.company_name END,
        a.unit_key
      ) AS unit_label,
      a.period_no,
      a.score,
      a.reasons,
      CASE
        WHEN a.unit_kind = 'acc' THEN (
          SELECT ABS(COALESCE(SUM(pb.home_dr - pb.home_cr), 0))::float
          FROM pbalance pb
          WHERE pb.acc_no = a.unit_key AND pb.period_no = a.period_no
        )
        WHEN a.unit_kind = 'dept' THEN (
          SELECT COALESCE(SUM(ABS(pb.home_dr - pb.home_cr)), 0)::float
          FROM pbalance pb
          JOIN gl_mast gm ON pb.acc_no = gm.acc_no
          JOIN acc_type at ON gm.acc_type = at.acc_type
          WHERE pb.dept_no = a.unit_key AND pb.period_no = a.period_no
            AND at.is_bs_type = false
        )
        WHEN a.unit_kind = 'cust' THEN (
          SELECT COALESCE(SUM(ar.outstanding), 0)::float
          FROM ar_invoice ar
          WHERE ar.debtor_code = a.unit_key
            AND ar.cancelled = false AND ar.outstanding > 0
        )
        ELSE NULL
      END AS observed_amount,
      a.first_flagged_at,
      r.run_id,
      r.model_version,
      r.finished_at,
      r.data_through
    FROM anomaly_alert a
    JOIN latest_ok_run r ON a.run_id = r.run_id
    LEFT JOIN dept d ON a.unit_kind = 'dept' AND a.unit_key = d.dept_no
    LEFT JOIN gl_mast gm_label ON a.unit_kind = 'acc' AND a.unit_key = gm_label.acc_no
    LEFT JOIN debtor db ON a.unit_kind = 'cust' AND a.unit_key = db.acc_no
    ${where}
  `;

  const anomalies: AnomalyResultItem[] = rows.map((row) => ({
    kind: row.unit_kind,
    unitKey: row.unit_key,
    unitLabel: row.unit_label,
    periodNo: row.period_no,
    score: row.score,
    reasons: stringsFromJson(row.reasons),
    observedAmount: row.observed_amount,
    firstFlaggedAt: row.first_flagged_at.toISOString(),
    ...(questionType === "anomaly_investigation"
      ? { suggestedAction: anomalyAction(row.unit_kind, row.unit_label) }
      : {}),
  }));

  const rankingBasis = questionType === "anomaly_impact" ? "observed_amount" : "score";
  anomalies.sort((a, b) => rankingBasis === "observed_amount"
    ? Math.abs(b.observedAmount ?? 0) - Math.abs(a.observedAmount ?? 0)
    : b.score - a.score);
  const limit = classification.top_n ?? (questionType === "anomaly_explanation" ? 10 : 20);
  anomalies.splice(limit);

  const first = rows[0];
  const run: ModelRunInfo | null = first ? {
    runId: first.run_id.toString(),
    modelVersion: first.model_version,
    finishedAt: first.finished_at?.toISOString() ?? null,
    dataThrough: first.data_through,
  } : null;

  return {
    questionType,
    anomalies,
    period: toPeriodInfo(period),
    run,
    rankingBasis,
    caveat: rankingBasis === "observed_amount"
      ? "Observed amount is a contextual exposure proxy, not a proven loss caused by the anomaly. Anomaly reasons are model evidence, not verified root causes."
      : "Anomalies are unusual observations, not confirmed errors or fraud. Reasons are model evidence, not verified root causes.",
    filters: filters.applied,
  };
}

function forecastAction(metric: string, forecast: number, actual: number | null): string {
  if (actual !== null) {
    const variance = forecast - actual;
    return variance < 0
      ? `Investigate why actual ${metric} is above the forecast and update the outlook`
      : `Review the ${metric} variance and validate whether the forecast assumptions remain current`;
  }
  if (/cost|expense/i.test(metric)) return `Review cost controls and capacity assumptions for forecast ${metric}`;
  if (/revenue|sales|profit/i.test(metric)) return `Validate pipeline and operating assumptions supporting forecast ${metric}`;
  return `Review assumptions and monitor actual ${metric} against the forecast`;
}

export async function getForecastAnalysis(
  classification: ClassificationResult
): Promise<ForecastAnalysisResult> {
  const questionType = classification.question_type as ForecastQuestion;
  const period = await resolvePeriod(classification.period ?? "next_month");
  if (!period) throw new Error("Could not resolve forecast period.");
  const filters = await resolveFilters(classification);

  const conditions: Prisma.Sql[] = [
    Prisma.sql`fv.period_no IN (${Prisma.join(period.periodNos)})`,
  ];
  if (classification.metric) {
    conditions.push(Prisma.sql`LOWER(fv.metric) = LOWER(${classification.metric})`);
  }
  if (filters.deptNos?.length) {
    conditions.push(Prisma.sql`fv.dept_no IN (${Prisma.join(filters.deptNos)})`);
  }
  const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

  const rows = await prisma.$queryRaw<
    {
      kind: string;
      dept_no: string | null;
      department: string | null;
      metric: string;
      origin: number;
      period_no: number;
      horizon: number;
      yhat: number;
      actual: number | null;
      method: string | null;
      run_id: bigint;
      model_version: string;
      finished_at: Date | null;
      data_through: number | null;
    }[]
  >`
    WITH latest_ok_run AS (
      SELECT run_id, model_version, finished_at, data_through
      FROM forecast_run
      WHERE LOWER(status) IN ('ok', 'success', 'successful', 'completed')
      ORDER BY run_id DESC
      LIMIT 1
    ), ranked AS (
      SELECT
        fv.*,
        ROW_NUMBER() OVER (
          PARTITION BY fv.kind, fv.dept_no, fv.metric, fv.period_no
          ORDER BY fv.origin DESC, fv.horizon ASC
        ) AS rn
      FROM forecast_value fv
      JOIN latest_ok_run r ON fv.run_id = r.run_id
      ${where}
    )
    SELECT
      fv.kind,
      fv.dept_no,
      d.description AS department,
      fv.metric,
      fv.origin,
      fv.period_no,
      fv.horizon::int,
      fv.yhat::float,
      fv.actual::float,
      fv.method,
      r.run_id,
      r.model_version,
      r.finished_at,
      r.data_through
    FROM ranked fv
    JOIN latest_ok_run r ON true
    LEFT JOIN dept d ON fv.dept_no = d.dept_no
    WHERE fv.rn = 1
    ORDER BY fv.metric, d.description NULLS FIRST
  `;

  const forecasts: ForecastResultItem[] = rows.map((row) => ({
    kind: row.kind,
    departmentCode: row.dept_no,
    department: row.department,
    metric: row.metric,
    origin: row.origin,
    periodNo: row.period_no,
    horizon: row.horizon,
    forecast: row.yhat,
    actual: row.actual,
    method: row.method,
    ...(questionType === "forecast_action"
      ? { suggestedAction: forecastAction(row.metric, row.yhat, row.actual) }
      : {}),
  }));
  const first = rows[0];
  const run: ModelRunInfo | null = first ? {
    runId: first.run_id.toString(),
    modelVersion: first.model_version,
    finishedAt: first.finished_at?.toISOString() ?? null,
    dataThrough: first.data_through,
  } : null;

  return {
    questionType,
    forecasts,
    period: toPeriodInfo(period),
    run,
    caveat: "Forecast values are predictions, not guaranteed outcomes. No confidence interval is available; do not invent one.",
    filters: filters.applied,
  };
}
