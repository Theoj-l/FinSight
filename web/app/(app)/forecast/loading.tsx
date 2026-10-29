import { ForecastLoading } from "@/app/forecast/components/forecast-loading";
import { FilterBarSkeleton, HeadingSkeleton } from "@/app/components/route-loading";

export default function Loading() {
  return (
    <>
      <HeadingSkeleton />
      <FilterBarSkeleton />
      <ForecastLoading />
    </>
  );
}
