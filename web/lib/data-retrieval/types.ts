// ---------------------------------------------------------------------------
// types.ts — Return types for all data-retrieval service functions.
//
// Covers Information Retrieval, Analytical Interpretation, and
// Recommendation question types.  RetrievalResult is the discriminated
// union every handler resolves to.
// ---------------------------------------------------------------------------

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Period information attached to results for context. */
export interface PeriodInfo {
  /** The YYYYMM period_no(s) that were queried. */
  periodNos: number[];
  /** Human-readable label, e.g. "June 2026". */
  label: string;
}

/** Resolved filter echoed back in the result for transparency. */
export type AppliedFilters = Record<string, string>;

// ═══════════════════════════════════════════════════════════════════════════
// INFORMATION RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════

// ── metric_value ────────────────────────────────────────────────────────────

export interface MetricValueResult {
  questionType: "metric_value";
  metric: string;
  value: number;
  source: "actual" | "budget";
  period: PeriodInfo | null;
  filters: AppliedFilters;
}

// ── metric_comparison ───────────────────────────────────────────────────────

export interface MetricComparisonResult {
  questionType: "metric_comparison";
  metric: string;
  comparisonType: "period" | "actual_vs_budget";
  current: {
    value: number;
    period: PeriodInfo;
    source: "actual" | "budget";
  };
  previous: {
    value: number;
    period: PeriodInfo;
    source: "actual" | "budget";
  };
  change: number;
  /** null when previous value is zero (division by zero). */
  changePct: number | null;
  filters: AppliedFilters;
}

// ── top_n ───────────────────────────────────────────────────────────────────

export interface TopNItem {
  label: string;
  value: number;
}

export interface TopNResult {
  questionType: "top_n";
  metric: string;
  dimension: string;
  items: TopNItem[];
  n: number;
  period: PeriodInfo | null;
  filters: AppliedFilters;
}

// ── trend ───────────────────────────────────────────────────────────────────

export interface TrendPoint {
  period: string;
  periodNo: number;
  value: number;
}

export interface TrendResult {
  questionType: "trend";
  metric: string;
  points: TrendPoint[];
  filters: AppliedFilters;
}

// ── invoice_status ──────────────────────────────────────────────────────────

export interface InvoiceRow {
  docNo: string;
  customer: string;
  amount: number;
  outstanding: number;
  dueDate: string;
  daysOverdue: number;
  status: "current" | "overdue" | "paid";
}

export interface InvoiceStatusResult {
  questionType: "invoice_status";
  invoices: InvoiceRow[];
  summary: {
    totalInvoices: number;
    totalOutstanding: number;
    overdueCount: number;
  };
  filters: AppliedFilters;
}

// ── ar_summary ──────────────────────────────────────────────────────────────

export interface AgingBucket {
  label: string;
  amount: number;
  count: number;
}

export interface TopDebtor {
  name: string;
  outstanding: number;
}

export interface ARSummaryResult {
  questionType: "ar_summary";
  totalOutstanding: number;
  totalOverdue: number;
  buckets: AgingBucket[];
  topDebtors: TopDebtor[];
  filters: AppliedFilters;
}

// ── pl_summary ──────────────────────────────────────────────────────────────

export interface PLRow {
  seq: number;
  label: string;
  rowType: string;
  amount: number;
}

export interface PLSummaryResult {
  questionType: "pl_summary";
  rows: PLRow[];
  period: PeriodInfo;
  filters: AppliedFilters;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICAL INTERPRETATION
// ═══════════════════════════════════════════════════════════════════════════

// ── Shared analytical building blocks ───────────────────────────────────────

/** A single component in a variance decomposition (e.g. one account, one dept). */
export interface VarianceComponent {
  label: string;
  currentValue: number;
  previousValue: number;
  change: number;
  /** null when previousValue is zero. */
  changePct: number | null;
  /** How much of the total change this component explains (%). */
  contributionPct: number | null;
}

/** A GL transaction that explains a movement. */
export interface TransactionDriver {
  date: string;
  docNo: string;
  description: string;
  department: string;
  amount: number;
  journalType: string;
  refNo: string;
}

// ── variance breakdown (revenue / cost / profit / sales / payroll / ar) ─────

export interface VarianceBreakdownResult {
  questionType:
    | "revenue_variance"
    | "cost_variance"
    | "profit_variance"
    | "sales_variance"
    | "payroll_variance"
    | "ar_variance";
  metric: string;
  totalCurrent: number;
  totalPrevious: number;
  totalChange: number;
  totalChangePct: number | null;
  /** Breakdown by account / category / customer depending on question type. */
  byCategory: VarianceComponent[];
  /** Breakdown by department / business unit. */
  byDepartment: VarianceComponent[];
  /** Top driver transactions from gl_dtl for root-cause context. */
  topDriverTransactions: TransactionDriver[];
  currentPeriod: PeriodInfo;
  previousPeriod: PeriodInfo;
  filters: AppliedFilters;
}

// ── margin_variance ─────────────────────────────────────────────────────────

export interface DepartmentMargin {
  department: string;
  currentMargin: number;
  previousMargin: number;
  changeBps: number;
}

export interface ProductMargin {
  product: string;
  revenue: number;
  cost: number;
  margin: number;
}

export interface MarginAnalysisResult {
  questionType: "margin_variance";
  currentGrossMargin: number;
  previousGrossMargin: number;
  grossMarginChangeBps: number;
  currentNetMargin: number;
  previousNetMargin: number;
  netMarginChangeBps: number;
  departmentMargins: DepartmentMargin[];
  lowestMarginProducts: ProductMargin[];
  currentPeriod: PeriodInfo;
  previousPeriod: PeriodInfo;
  filters: AppliedFilters;
}

// ── performance_summary ─────────────────────────────────────────────────────

export interface ScorecardItem {
  metric: string;
  currentValue: number;
  previousValue: number;
  change: number;
  changePct: number | null;
}

export interface PerformanceSummaryResult {
  questionType: "performance_summary";
  scorecard: ScorecardItem[];
  topPositive: VarianceComponent[];
  topNegative: VarianceComponent[];
  departmentPerformance: VarianceComponent[];
  currentPeriod: PeriodInfo;
  previousPeriod: PeriodInfo;
  filters: AppliedFilters;
}

// ═══════════════════════════════════════════════════════════════════════════
// RECOMMENDATION
// ═══════════════════════════════════════════════════════════════════════════

// ── payment_follow_up ───────────────────────────────────────────────────────

export interface FollowUpItem {
  customer: string;
  outstanding: number;
  daysOverdue: number;
  oldestInvoice: string;
  invoiceCount: number;
  priority: "high" | "medium" | "low";
}

export interface PaymentFollowUpResult {
  questionType: "payment_follow_up";
  items: FollowUpItem[];
  totalAtRisk: number;
  filters: AppliedFilters;
}

// ── management priorities (cost_investigation / sales_follow_up / etc.) ─────

export interface PriorityItem {
  area: string;
  finding: string;
  impact: number;
  suggestedAction: string;
  priority: "high" | "medium" | "low";
}

export interface ManagementPrioritiesResult {
  questionType:
    | "cost_investigation"
    | "sales_follow_up"
    | "payroll_investigation"
    | "management_priority";
  focusArea: string;
  priorities: PriorityItem[];
  currentPeriod: PeriodInfo;
  previousPeriod: PeriodInfo;
  filters: AppliedFilters;
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCRIMINATED UNION
// ═══════════════════════════════════════════════════════════════════════════

export type RetrievalResult =
  // Information Retrieval
  | MetricValueResult
  | MetricComparisonResult
  | TopNResult
  | TrendResult
  | InvoiceStatusResult
  | ARSummaryResult
  | PLSummaryResult
  // Analytical Interpretation
  | VarianceBreakdownResult
  | MarginAnalysisResult
  | PerformanceSummaryResult
  // Recommendation
  | PaymentFollowUpResult
  | ManagementPrioritiesResult;
