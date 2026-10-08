import { formatCurrencyExact } from "@/lib/currency";
export const VALID_SEGMENTS = ["Machining", "Bulk"] as const;
export type BusinessSegment = (typeof VALID_SEGMENTS)[number];

export type RevenueByBusinessTypePoint = {
  segment: BusinessSegment;
  businessType: BusinessSegment;
  revenue: number;
  percentage: number;
};

export type BusinessTypeRevenueRow = {
  segment?: string | null;
  businessType?: string | null;
  revenue: number | string | { toNumber(): number } | null | undefined;
};

function decimalToNumber(value: BusinessTypeRevenueRow["revenue"]): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function isValidSegment(value: string): value is BusinessSegment {
  return (VALID_SEGMENTS as readonly string[]).includes(value);
}

export function aggregateRevenueByBusinessType(
  rows: BusinessTypeRevenueRow[]
): RevenueByBusinessTypePoint[] {
  const totals = new Map<BusinessSegment, number>();

  for (const row of rows) {
    const rawSegment = row.segment ?? row.businessType;
    if (!rawSegment || !isValidSegment(rawSegment)) continue;

    const revenue = decimalToNumber(row.revenue);
    if (revenue > 0) {
      totals.set(rawSegment, (totals.get(rawSegment) ?? 0) + revenue);
    }
  }

  const totalRevenue = [...totals.values()].reduce((sum, rev) => sum + rev, 0);
  if (totalRevenue <= 0) {
    return [];
  }

  return [...totals.entries()]
    .filter(([, revenue]) => revenue > 0)
    .map(([segment, revenue]) => ({
      segment,
      businessType: segment,
      revenue,
      percentage: (revenue / totalRevenue) * 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export { formatCurrencyExact };