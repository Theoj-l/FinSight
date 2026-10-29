import { DashboardPanelLoading } from "@/app/dashboard/components/dashboard-panels";
import { FilterBarSkeleton, HeadingSkeleton } from "@/app/components/route-loading";

export default function Loading() {
  return (
    <>
      <HeadingSkeleton />
      <FilterBarSkeleton />
      <DashboardPanelLoading label="KPI data" />
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <DashboardPanelLoading label="financial data" />
        <DashboardPanelLoading label="profit data" />
      </div>
    </>
  );
}
