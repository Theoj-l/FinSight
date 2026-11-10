"use client";

import { useChartWidth, type PieLabelRenderProps } from "recharts";

const LABEL_FONT_SIZE = 16;
const LABEL_EDGE_GAP = 4;
let measureContext: CanvasRenderingContext2D | null | undefined;

function labelWidth(text: string) {
  if (measureContext === undefined && typeof document !== "undefined") {
    measureContext = document.createElement("canvas").getContext("2d");
    if (measureContext) measureContext.font = `${LABEL_FONT_SIZE}px ${getComputedStyle(document.body).fontFamily}`;
  }
  return measureContext ? measureContext.measureText(text).width : text.length * LABEL_FONT_SIZE * 0.6;
}

/**
 * Outside-the-ring slice label for the dashboard donuts. "Name 12.3%" can run past the chart edge on
 * narrow cards and get cut off, so it falls back to just the percentage (each donut's legend names the
 * slices), and as a last resort is pulled inward so it is never clipped.
 */
export function DonutLabel({ name, percentage, ...props }: PieLabelRenderProps & { name: string; percentage: number }) {
  const chartWidth = useChartWidth() ?? 0;
  const percent = `${percentage.toFixed(1)}%`;
  const full = `${name} ${percent}`;
  const x = Number(props.x);
  const anchor = props.textAnchor === "start" || props.textAnchor === "end" ? props.textAnchor : "middle";
  const span = (text: string) => {
    const width = labelWidth(text);
    const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
    return { left, right: left + width };
  };
  const fits = (text: string) => {
    const { left, right } = span(text);
    return left >= LABEL_EDGE_GAP && right <= chartWidth - LABEL_EDGE_GAP;
  };
  const text = fits(full) ? full : percent;
  const { left, right } = span(text);
  const shift = left < LABEL_EDGE_GAP ? LABEL_EDGE_GAP - left : right > chartWidth - LABEL_EDGE_GAP ? chartWidth - LABEL_EDGE_GAP - right : 0;
  return (
    <text x={x + shift} y={props.y} textAnchor={anchor} dominantBaseline="central" fill={props.fill} fontSize={LABEL_FONT_SIZE} className="recharts-pie-label-text">
      {text}
    </text>
  );
}
