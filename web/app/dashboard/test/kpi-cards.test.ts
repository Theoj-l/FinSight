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
  // Revenue fell 50% against a 10% threshold: red, and listed in the attention line.
  expect(html).toMatch(/\d+(<!-- -->)? unfavourable:/);
  expect(html).toMatch(/Needs attention.*Operating revenue/);
  expect(html).toContain('data-status="unfavourable"');
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
  // Cost and gross-profit forecasts do not exist, so those cards have nothing to compare.
  expect(html).toContain("Comparison unavailable");
  expect(html).toContain("vs auto forecast");
});
