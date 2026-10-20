/** Bounds are the whole chart, including its axes, rather than just the plot. */
export function comparisonHoverLayout(chartWidth: number, chartHeight: number, x: number, y: number, cardHeight: number, preferredWidth = 240) {
  const inset = 8;
  const width = Math.min(preferredWidth, Math.max(0, chartWidth - inset * 2));
  const maxLeft = Math.max(inset, chartWidth - width - inset);
  const right = x + 12;
  const preferredLeft = right <= maxLeft ? right : x - width - 12;
  return {
    width,
    left: Math.max(inset, Math.min(preferredLeft, maxLeft)),
    top: Math.max(inset, Math.min(y + 12, chartHeight - cardHeight - inset)),
    maxHeight: Math.max(0, chartHeight - inset * 2),
  };
}
