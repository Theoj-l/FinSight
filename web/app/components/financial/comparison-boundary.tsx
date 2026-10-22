import type { ReactNode } from "react";
import type { DashboardScope } from "@/app/dashboard/data/dashboard-scope";
import { getFinancialBundle } from "@/lib/financial/data";
import { FinancialProvider } from "./comparison-context";
export async function FinancialComparisonBoundary({
  scope,
  children,
}: {
  scope: DashboardScope | null;
  children: ReactNode;
}) {
  let bundle = null;
  let error: string | undefined;
  if (scope) {
    try {
      bundle = await getFinancialBundle(scope);
    } catch (e) {
      error =
        e instanceof Error && e.message.includes("Branch-level")
          ? e.message
          : "Financial comparisons could not be loaded. Refresh to retry.";
    }
  }
  return (
    <FinancialProvider bundle={bundle} error={error}>
      {children}
    </FinancialProvider>
  );
}
