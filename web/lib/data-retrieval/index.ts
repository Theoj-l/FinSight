// ---------------------------------------------------------------------------
// index.ts — Flat question-type dispatcher for all data retrieval.
//
// Maps every question_type across all intents (information_retrieval,
// analytical_interpretation, recommendation) to its handler function.
// No intent-based routing — one flat QUESTION_TYPE_HANDLERS map.
// ---------------------------------------------------------------------------

import type { ClassificationResult } from "@/lib/types/classification";
import type { RetrievalResult } from "./types";

// ── Service imports ─────────────────────────────────────────────────────────

import {
  getMetricValue,
  getMetricComparison,
  getMetricTrend,
  getTopN,
} from "./services/metric-service";

import {
  getPLSummary,
  getVarianceBreakdown,
  getMarginAnalysis,
} from "./services/pl-service";

import {
  getInvoiceStatus,
  getOverdueCustomers,
  getARSummary,
} from "./services/ar-service";

import { getPerformanceSummary } from "./services/performance-service";

import {
  getPaymentFollowUp,
  getManagementPriorities,
} from "./services/recommendation-service";

// ── Handler map ─────────────────────────────────────────────────────────────

type Handler = (c: ClassificationResult) => Promise<RetrievalResult>;

const QUESTION_TYPE_HANDLERS: Record<string, Handler> = {
  // Information Retrieval
  metric_value:      getMetricValue,
  metric_comparison: getMetricComparison,
  top_n:             getTopN,
  trend:             getMetricTrend,
  invoice_status:    getInvoiceStatus,
  overdue_customers: getOverdueCustomers,
  ar_summary:        getARSummary,
  pl_summary:        getPLSummary,

  // Analytical Interpretation
  revenue_variance:    getVarianceBreakdown,
  cost_variance:       getVarianceBreakdown,
  profit_variance:     getVarianceBreakdown,
  sales_variance:      getVarianceBreakdown,
  payroll_variance:    getVarianceBreakdown,
  ar_variance:         getVarianceBreakdown,
  margin_variance:     getMarginAnalysis,
  performance_summary: getPerformanceSummary,

  // Recommendation
  payment_follow_up:     getPaymentFollowUp,
  cost_investigation:    getManagementPriorities,
  sales_follow_up:       getManagementPriorities,
  margin_investigation:  getManagementPriorities,
  payroll_investigation: getManagementPriorities,
  management_priority:   getManagementPriorities,
};

// ── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Route a classified user question to the correct data-retrieval handler.
 *
 * Call this after classification + validation.  The returned
 * `RetrievalResult` is a discriminated union keyed by `questionType`.
 *
 * @throws Error if the question_type has no registered handler.
 */
export async function retrieveData(
  classification: ClassificationResult
): Promise<RetrievalResult> {
  const handler = QUESTION_TYPE_HANDLERS[classification.question_type];
  if (!handler) {
    throw new Error(
      `No handler registered for question_type: "${classification.question_type}"`
    );
  }
  return handler(classification);
}

// ── Re-exports ──────────────────────────────────────────────────────────────

export type { RetrievalResult } from "./types";
export { getMetricValue, getMetricComparison, getMetricTrend, getTopN } from "./services/metric-service";
export { getPLSummary, getVarianceBreakdown, getMarginAnalysis } from "./services/pl-service";
export { getInvoiceStatus, getOverdueCustomers, getARSummary } from "./services/ar-service";
export { getPerformanceSummary } from "./services/performance-service";
export { getPaymentFollowUp, getManagementPriorities } from "./services/recommendation-service";
