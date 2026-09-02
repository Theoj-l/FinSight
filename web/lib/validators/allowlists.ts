// ---------------------------------------------------------------------------
// allowlists.ts — Runtime sets derived from the canonical const arrays in
// classification.ts.  The validator checks every Gemini output field against
// these sets so hallucinated values are caught before they reach the router.
// ---------------------------------------------------------------------------

import {
  INTENTS,
  QUESTION_TYPES,
  METRICS,
  DIMENSIONS,
  DATASETS,
  FILTER_KEYS,
  type Intent,
} from "../types/classification";

// ── Value sets ──────────────────────────────────────────────────────────────

export const VALID_INTENTS = new Set<string>(INTENTS);
export const VALID_QUESTION_TYPES = new Set<string>(QUESTION_TYPES);
export const VALID_METRICS = new Set<string>(METRICS);
export const VALID_DIMENSIONS = new Set<string>(DIMENSIONS);
export const VALID_DATASETS = new Set<string>(DATASETS);
export const VALID_FILTER_KEYS = new Set<string>(FILTER_KEYS);

// ── Intent → allowed question types ────────────────────────────────────────

export const QUESTION_TYPES_BY_INTENT: Record<Intent, Set<string>> = {
  information_retrieval: new Set([
    "metric_value",
    "metric_comparison",
    "top_n",
    "trend",
    "invoice_status",
    "ar_summary",
    "pl_summary",
  ]),
  analytical_interpretation: new Set([
    "revenue_variance",
    "cost_variance",
    "profit_variance",
    "margin_variance",
    "sales_variance",
    "payroll_variance",
    "ar_variance",
    "performance_summary",
  ]),
  recommendation: new Set([
    "payment_follow_up",
    "cost_investigation",
    "sales_follow_up",
    "payroll_investigation",
    "management_priority",
  ]),
  unsupported: new Set(["unsupported"]),
};
