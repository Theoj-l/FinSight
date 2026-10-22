import { isPeriod, isSource, type Rules } from "./types";
import { validRules } from "./engine";
export function isBudgetId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{1,19}$/.test(value) &&
    BigInt(value) <= BigInt("9223372036854775807")
  );
}
export type FinancialWrite =
  | { kind: "rules"; rules: Rules }
  | {
      kind: "source";
      source: "previous" | "budget" | "auto" | "manual";
      budgetId?: string | null;
    }
  | { kind: "scenario"; name: string }
  | {
      kind: "manual";
      department: string;
      period: number;
      revenue: string | null;
      netProfit: string | null;
    }
  | {
      kind: "budget";
      department: string;
      period: number;
      budgetId: string;
      entries: { account: string; amount: string | null }[];
    };
export function money(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      /^-?\d{1,15}(\.\d{1,4})?$/.test(value) &&
      Number.isFinite(Number(value)))
  );
}
export function validateWrite(value: unknown): FinancialWrite {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid request.");
  const v = value as Record<string, unknown>;
  if (v.kind === "rules" && validRules(v.rules))
    return { kind: "rules", rules: v.rules };
  if (
    v.kind === "source" &&
    isSource(v.source) &&
    (v.budgetId == null || isBudgetId(v.budgetId))
  )
    return {
      kind: "source",
      source: v.source,
      ...(v.budgetId === undefined
        ? {}
        : { budgetId: v.budgetId as string | null }),
    };
  if (
    v.kind === "scenario" &&
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    v.name.trim().length <= 20
  )
    return { kind: "scenario", name: v.name.trim() };
  if (
    typeof v.department !== "string" ||
    !v.department ||
    v.department.length > 10 ||
    !isPeriod(v.period)
  )
    throw new Error("Choose a valid department and month.");
  if (v.kind === "manual" && money(v.revenue) && money(v.netProfit))
    return {
      kind: "manual",
      department: v.department,
      period: v.period,
      revenue: v.revenue,
      netProfit: v.netProfit,
    };
  if (
    v.kind === "budget" &&
    typeof v.budgetId === "string" &&
    isBudgetId(v.budgetId) &&
    Array.isArray(v.entries) &&
    v.entries.length <= 1000 &&
    v.entries.every(
      (e) => e && typeof e.account === "string" && money(e.amount),
    ) &&
    new Set(v.entries.map((e) => e.account)).size === v.entries.length
  )
    return v as FinancialWrite;
  throw new Error(
    "Enter valid amounts (up to 15 digits and 4 decimal places), rules, and source. Blank amounts mean unavailable, not zero.",
  );
}
