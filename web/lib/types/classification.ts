// ---------------------------------------------------------------------------
// classification.ts — Single source of truth for the intent-classification
// JSON schema. Every allowed value is defined here as a const array so both
// the Gemini response-schema and the backend validator can reference the
// same list without drift.
// ---------------------------------------------------------------------------

// ── Intents ─────────────────────────────────────────────────────────────────

export const INTENTS = [
  "information_retrieval",
  "analytical_interpretation",
  "recommendation",
  "unsupported",
] as const;

export type Intent = (typeof INTENTS)[number];

// ── Question types ──────────────────────────────────────────────────────────

export const QUESTION_TYPES = [
  // Information Retrieval
  "metric_value",
  "metric_comparison",
  "top_n",
  "trend",
  "invoice_status",
  "ar_summary",
  "pl_summary",
  // Analytical Interpretation
  "revenue_variance",
  "cost_variance",
  "profit_variance",
  "margin_variance",
  "sales_variance",
  "payroll_variance",
  "ar_variance",
  "performance_summary",
  // Recommendation
  "payment_follow_up",
  "cost_investigation",
  "sales_follow_up",
  "payroll_investigation",
  "management_priority",
  // Fallback
  "unsupported",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

// ── Metrics ─────────────────────────────────────────────────────────────────

export const METRICS = [
  "revenue",
  "total_cost",
  "cogs",
  "operating_expense",
  "gross_profit",
  "net_profit",
  "gross_margin",
  "net_margin",
  "sales",
  "payroll_cost",
  "headcount",
  "overtime_cost",
  "outstanding_amount",
  "days_overdue",
] as const;

export type Metric = (typeof METRICS)[number];

// ── Dimensions ──────────────────────────────────────────────────────────────

export const DIMENSIONS = [
  "account_name",
  "account_group",
  "business_unit",
  "department",
  "customer",
  "product_category",
  "employee_category",
  "sales_channel",
  "salesperson",
  "ageing_bucket",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

// ── Datasets ────────────────────────────────────────────────────────────────

export const DATASETS = [
  "profit_loss",
  "sales",
  "payroll",
  "accounts_receivable",
] as const;

export type Dataset = (typeof DATASETS)[number];

// ── Filter keys ─────────────────────────────────────────────────────────────

export const FILTER_KEYS = [
  "department",
  "business_unit",
  "customer",
  "product_category",
  "payment_status",
  "salesperson",
] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];

// ── Classification result ───────────────────────────────────────────────────

export interface ClassificationResult {
  intent: Intent;
  question_type: QuestionType;
  datasets: Dataset[];
  metric: Metric | null;
  period: string | null;
  comparison_period: string | null;
  dimensions: Dimension[];
  filters: Partial<Record<FilterKey, string>>;
  top_n: number | null;
  is_supported: boolean;
  is_ambiguous: boolean;
  confidence: number;
  reason: string;
}

// ── Validation result ───────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
