import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { financialFixture } from "@/tests/fixtures/financial";
const state = vi.hoisted(() => ({ source: "previous" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({ comparison: state.source }) }));
import { FinancialProvider } from "@/app/components/financial/comparison-context";
import { KpiCards } from "../components/kpi-cards";
it("uses shared rules, unfavorable-only attention, and Settings links rather than inline forms", () => {
  vi.stubGlobal("React", React); state.source = "previous";
  const html = renderToStaticMarkup(React.createElement(FinancialProvider, { bundle: financialFixture() }, React.createElement(KpiCards)));
  expect(html).toContain("Attention needed: Operating revenue");
  expect(html).toContain('/settings#thresholds');
  expect(html).not.toContain("Configure attention thresholds");
  expect(html).not.toContain("Budget variance");
  expect(html).not.toContain("<form");
});
it("changes the selected comparison without changing actual values, and marks unsupported forecasts unavailable", () => {
  vi.stubGlobal("React", React); state.source = "auto";
  const html = renderToStaticMarkup(React.createElement(FinancialProvider, { bundle: financialFixture() }, React.createElement(KpiCards)));
  expect(html).toContain("Auto forecast");
  expect(html).toContain("S$100");
  expect(html).toContain("Percentage comparison unavailable");
});
