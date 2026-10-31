import type { Comparison } from "./types";

export type TrafficLight = "favourable" | "attention" | "unfavourable" | "unavailable";

/**
 * Traffic-light status of a comparison, from the thresholds set in Settings
 * (the same rule that drives notifications):
 * - red ("unfavourable"): an unfavourable change beyond the metric's threshold;
 * - yellow ("attention"): unfavourable but within the threshold, or alerts are
 *   switched off for that metric;
 * - green ("favourable"): a favourable change, or no change.
 * "unavailable" when there is nothing to compare against.
 */
export function trafficLight(comparison: Comparison | null | undefined): TrafficLight {
  if (!comparison || comparison.absolute === null) return "unavailable";
  if (comparison.breach) return "unfavourable";
  if (comparison.unfavorable) return "attention";
  return "favourable";
}

export const TRAFFIC_LIGHT_LABEL: Record<TrafficLight, string> = {
  favourable: "Favourable",
  attention: "Attention required",
  unfavourable: "Unfavourable",
  unavailable: "No comparison",
};
