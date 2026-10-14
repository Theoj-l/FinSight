import type { ForecastAccuracy } from "@/app/dashboard/data/forecast-utils";

export function accuracyMessage(label: string, accuracy: ForecastAccuracy) {
  if (accuracy.meetsTarget === true) return `Recent ${label.toLowerCase()} projections are within the ${accuracy.targetMape}% reliability target.`;
  if (accuracy.meetsTarget === false) return `Recent ${label.toLowerCase()} projections have exceeded the ${accuracy.targetMape}% error target. Treat this projection as indicative.`;
  return "Accuracy not yet measured.";
}
