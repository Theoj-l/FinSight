import type { ReactNode } from "react";
import type { DashboardScope } from "@/app/dashboard/data/dashboard-scope";
import { getFinancialBundle } from "@/lib/financial/data";
import { FinancialProvider, type FinancialResult } from "./comparison-context";

// Deliberately not async: the bundle is handed down still loading, so the
// panels inside start their own queries now rather than after it. The parts
// that show comparisons wait for it inside their own <Suspense> boundaries.
export function FinancialComparisonBoundary({
  scope,
  children,
}: {
  scope: DashboardScope | null;
  children: ReactNode;
}) {
  const result: Promise<FinancialResult> = scope
    ? getFinancialBundle(scope).then(
        (bundle) => ({ bundle }),
        (e: unknown) => ({
          bundle: null,
          error:
            e instanceof Error && e.message.includes("Branch-level")
              ? e.message
              : "Financial comparisons could not be loaded. Refresh to retry.",
        }),
      )
    : Promise.resolve({ bundle: null });
  return <FinancialProvider result={result}>{children}</FinancialProvider>;
}
