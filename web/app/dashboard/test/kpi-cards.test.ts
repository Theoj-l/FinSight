import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { KpiData } from "../data/kpi-presentation";

const state = vi.hoisted(() => ({ session: null as unknown, stored: null as string | null }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return { ...actual,
    useState: (initial: unknown) => actual.useState(initial === null ? state.session : initial),
    useSyncExternalStore: () => state.stored,
  };
});
import { KpiCards } from "../components/kpi-cards";

afterEach(() => { state.session = null; state.stored = null; vi.unstubAllGlobals(); });
const data: KpiData = { period: "2024-02", priorPeriod: "2024-01", notices: [], metrics: [
  { id: "netProfit", label: "Net profit", unit: "money", value: "80.00", prior: "100.00", change: { absolute: "-20.00", percentage: -20, direction: -1 }, description: "Profit" },
  { id: "expenseRatio", label: "Operating expense ratio", unit: "ratio", value: "30.00", prior: "20.00", change: { absolute: "10.00", percentage: 50, direction: 1 }, description: "Expenses / revenue", higherIsBetter: false },
] };

it("renders alerts and settings with old in-memory settings missing the new metric", () => {
  // React Fast Refresh retains useState; browser storage migration alone cannot repair it.
  state.session = { netProfit: { enabled: true, min: -10, max: 25 } };
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(React.createElement(KpiCards, { data, userId: "test-user" }));
  expect(html).toContain("Operating expense ratio");
  expect(html).toContain('name="expenseRatio-enabled"');
  expect(html).toContain('name="netProfit-min" value="-10"');
  expect(html).toContain("Attention needed: Net profit, Operating expense ratio");
});

it("renders with a malformed saved entry without discarding another valid preference", () => {
  state.stored = JSON.stringify({ netProfit: { enabled: false, min: -10, max: 25 }, expenseRatio: null });
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(React.createElement(KpiCards, { data, userId: "test-user" }));
  expect(html).toContain("Attention needed: Operating expense ratio outside");
  expect(html).toContain("Attention alerts disabled.");
});
