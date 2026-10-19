"use client";
import { Curve } from "recharts";
import type { ComponentProps } from "react";
import type { LineDrawShapeProps } from "recharts/types/cartesian/LineDrawShape";

export const COMPARISON_STYLES = {
  monetary: { stroke: "#0891B2", strokeDasharray: "10 5" },
  secondary: { stroke: "#A855F7", strokeDasharray: "4 4" },
};
function OutlinedCurve({ points, type, layout, connectNulls, stroke, strokeDasharray }: LineDrawShapeProps) {
  const geometry = { points, type, layout, connectNulls, fill: "none" } satisfies ComponentProps<typeof Curve>;
  return <g><Curve {...geometry} stroke="white" strokeWidth={5} strokeDasharray={strokeDasharray} /><Curve {...geometry} stroke={stroke} strokeWidth={3} strokeDasharray={strokeDasharray} /></g>;
}
function Diamond({ cx, cy, stroke }: { cx?: number; cy?: number; stroke?: string }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return <g />;
  return <path d={`M ${cx} ${cy! - 4} l 4 4 -4 4 -4 -4 Z`} fill="white" stroke={stroke} strokeWidth={2} />;
}
export function comparisonStyle(kind: keyof typeof COMPARISON_STYLES) {
  return { ...COMPARISON_STYLES[kind], strokeWidth: 3, connectNulls: false, zIndex: 500, isAnimationActive: false, shape: OutlinedCurve, dot: kind === "secondary" ? <Diamond /> : { r: 4, fill: "white", strokeWidth: 2 } };
}
// Use the same shapes in the legend, without adding duplicate chart series.
export function ComparisonLegend({ payload }: { payload?: readonly { value?: string; color?: string; dataKey?: string | number; type?: string }[] }) {
  return <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">{payload?.map((entry, i) => {
    const key = String(entry.dataKey ?? "");
    const reference = key.startsWith("reference");
    const secondary = key === "referenceMargin" || key === "referenceExpenses";
    const style = COMPARISON_STYLES[secondary ? "secondary" : "monetary"];
    return <li key={i} className="flex items-center gap-1"><svg width="32" height="14" aria-hidden="true">{reference ? <><path d="M0 7H32" stroke={style.stroke} strokeWidth="3" strokeDasharray={style.strokeDasharray} />{secondary ? <Diamond cx={16} cy={7} stroke={style.stroke} /> : <circle cx="16" cy="7" r="3" fill="white" stroke={style.stroke} strokeWidth="2" />}</> : entry.type === "rect" ? <rect x="4" y="2" width="24" height="10" fill={entry.color} /> : <path d="M0 7H32" stroke={entry.color} strokeWidth="3" />}</svg><span>{entry.value}</span></li>;
  })}</ul>;
}
