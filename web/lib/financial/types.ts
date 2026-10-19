export const SOURCES = {
  previous: "Default — Previous month",
  budget: "Budget",
  auto: "Auto forecast",
  manual: "Manual forecast",
} as const;
export type Source = keyof typeof SOURCES;
export const METRICS = {
  revenue: { label: "Operating revenue", higher: true },
  grossProfit: { label: "Gross profit", higher: true },
  netProfit: { label: "Net profit", higher: true },
  grossMargin: { label: "Gross margin", higher: true },
  netMargin: { label: "Net margin", higher: true },
  expenseRatio: { label: "Operating expense ratio", higher: false },
  costOfSales: { label: "Cost of sales", higher: false },
  operatingExpenses: { label: "Operating expenses", higher: false },
  otherIncome: { label: "Other income", higher: true },
  totalRevenue: { label: "Total income", higher: true },
} as const;
export type Metric = keyof typeof METRICS;
export type Rule = { enabled: boolean; tolerance: number };
export type Rules = Record<Metric, Rule>;
export type Components = Record<"RE" | "OI" | "CS" | "EX", string | null>;
export type Values = Record<Metric, string | null>;
export type Comparison = {
  actual: string | null;
  reference: string | null;
  absolute: string | null;
  percentage: number | null;
  unfavorable: boolean;
  breach: boolean;
  tolerance: number;
  enabled: boolean;
  note?: string;
};
export type PeriodComparison = {
  period: number;
  metrics: Record<Metric, Comparison>;
  provenance: string[];
};
export type SourceSeries = Record<string, PeriodComparison>;
export type FinancialBundle = {
  period: number;
  departments: string[];
  rules: Rules;
  notificationSource: Source;
  notificationBudgetId?: string | null;
  sources: Record<Source, SourceSeries>;
  budgetSources: Record<string, SourceSeries>;
  sourceErrors?: Partial<Record<Source, string>>;
  budgets: { id: string; name: string }[];
  ytd: Values;
  scopeLabel: string;
  forecastNotice: string;
};
export const defaultRules = (): Rules =>
  Object.fromEntries(
    Object.keys(METRICS).map((key) => [key, { enabled: true, tolerance: 0 }]),
  ) as Rules;
export const isSource = (s: unknown): s is Source =>
  typeof s === "string" && Object.hasOwn(SOURCES, s);
export const isPeriod = (p: unknown): p is number =>
  typeof p === "number" &&
  Number.isInteger(p) &&
  p >= 100001 &&
  p <= 999912 &&
  p % 100 >= 1 &&
  p % 100 <= 12;
export const monthLabel = (p: number) =>
  `${Math.floor(p / 100)}-${String(p % 100).padStart(2, "0")}`;
export function addMonth(p: number, n: number) {
  const i = Math.floor(p / 100) * 12 + (p % 100) - 1 + n;
  return Math.floor(i / 12) * 100 + (((i % 12) + 12) % 12) + 1;
}
export function notificationId(
  period: string,
  metric: Metric,
  source: Source,
  c: Comparison,
) {
  return `financial:v1:${period}:${metric}:${source}:${c.actual}:${c.reference}:${c.enabled}:${c.tolerance}`;
}
