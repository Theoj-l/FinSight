"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Tooltip, useChartHeight, useChartWidth, type TooltipContentProps } from "recharts";
import { useCurrency } from "@/lib/currency-context";
import { formatCurrencyExact } from "@/lib/currency";
import { SOURCES, type Source } from "@/lib/financial/types";
import { comparisonHoverLayout } from "./comparison-hover-layout";

type Measure = { label: string; actualKey: string; comparisonKey: string; percentage?: boolean };
type ModelMeasure = { label: string; key: string; percentage?: boolean };
type HoverConfig = { source?: Source; measures: Measure[]; model?: ModelMeasure };

export function ComparisonSource({ source }: { source?: Source }) {
  return source ? <p className="mt-3 text-xs text-muted">Comparison: {SOURCES[source]}</p> : null;
}

export function ComparisonHover(config: HoverConfig) {
  return <Tooltip
    filterNull={false}
    offset={12}
    isAnimationActive={false}
    cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "3 3", fill: "transparent" }}
    // Content owns positioning so a narrow plot does not push the card outside
    // the chart. Keep Recharts' hover, keyboard, touch and Escape handling.
    wrapperStyle={{ transform: "none", pointerEvents: "none", inset: 0, width: "100%", height: "100%", zIndex: 50 }}
    content={props => <ComparisonHoverContent {...props} {...config} />}
  />;
}

function ComparisonHoverContent({ active, payload, label, coordinate, source, measures, model }: Pick<TooltipContentProps<number, string>, "active" | "payload" | "label" | "coordinate"> & HoverConfig) {
  const fx = useCurrency();
  const width = useChartWidth() ?? 0;
  const height = useChartHeight() ?? 0;
  const card = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ width: 240, height: 160 });
  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      setCardSize(previous => previous.width === bounds.width && previous.height === bounds.height ? previous : { width: bounds.width, height: bounds.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, width, payload.length]);
  if (!active || !payload.length || !coordinate || !width || !height) return null;
  const point = payload.find(entry => entry.payload)?.payload as Record<string, unknown> | undefined;
  if (!point) return null;
  const position = comparisonHoverLayout(width, height, coordinate.x ?? 0, coordinate.y ?? 0, cardSize.height, cardSize.width);
  const narrow = width < 280;
  function value(key: string, percentage = false) {
    const raw = point![key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) return "Unavailable";
    return percentage ? `${raw.toFixed(2)}%` : formatCurrencyExact(raw, fx);
  }
  return <div ref={card} role="tooltip" aria-label={`${label} comparison values`} className="absolute rounded-lg border border-slate-200 bg-white p-3 text-brand-navy shadow-md" style={{ ...position, width: "max-content", minWidth: Math.min(240, width - 16), maxWidth: width - 16, overflowWrap: "normal", fontSize: 11, lineHeight: "16px" }}>
    <p className="text-sm font-semibold">{label}</p>
    {source && <p className="mt-0.5 text-muted">{SOURCES[source]}</p>}
    <table aria-label="Actual and comparison values" className="mt-2 w-full border-collapse tabular-nums" style={narrow ? { display: "block" } : undefined}>
      <thead className={narrow ? "sr-only" : "text-muted"}><tr><th style={{ padding: "0 8px 4px 0" }} className="text-left font-medium"><span className="sr-only">Metric</span></th><th style={{ padding: "0 0 4px 8px", whiteSpace: "nowrap" }} className="text-right font-medium">Actual</th>{source && <th style={{ padding: "0 0 4px 8px", whiteSpace: "nowrap" }} className="text-right font-medium">Comparison</th>}</tr></thead>
      <tbody style={narrow ? { display: "block" } : undefined}>{measures.map(measure => <tr key={measure.actualKey} className="border-t border-slate-100" style={narrow ? { display: "block", paddingBlock: 4 } : undefined}>
        <th scope="row" style={{ padding: narrow ? "2px 0" : "6px 8px 6px 0", display: narrow ? "block" : undefined, whiteSpace: "nowrap" }} className="text-left font-medium">{measure.label}</th>
        {[{ label: "Actual", key: measure.actualKey }, ...(source ? [{ label: "Comparison", key: measure.comparisonKey }] : [])].map(cell => <td key={cell.label} style={{ padding: narrow ? "2px 0" : "6px 0 6px 8px", whiteSpace: "nowrap", display: narrow ? "flex" : undefined, justifyContent: "space-between", gap: 12 }} className="text-right align-top">
          {narrow && <span aria-hidden="true" className="text-muted">{cell.label}</span>}<span data-hover-value>{value(cell.key, measure.percentage)}</span>
        </td>)}
      </tr>)}</tbody>
    </table>
    {model && <p className="mt-1 border-t border-slate-200 pt-2 text-muted">{model.label}: <span className="font-medium text-brand-navy">{value(model.key, model.percentage)}</span></p>}
  </div>;
}
