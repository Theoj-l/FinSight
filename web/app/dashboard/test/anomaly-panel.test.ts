import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AnomalyPanel } from "../components/anomaly-panel";
const status = { scoredAt: "2026-09-01T00:00:00Z", scoredFrom: 202201, scoredThrough: 202608, dataThrough: 202608, modelVersion: "v1", alertCount: 0 };
it("does not describe pre-model or provisional months as having no anomalies", () => {
  for (const period of [202101, 202609]) {
    const html = renderToStaticMarkup(createElement(AnomalyPanel, { alerts: [], status, periodStart: period, periodEnd: period }));
    expect(html).toContain("not yet checked");
    expect(html).not.toContain("No anomalies detected");
  }
});
it("distinguishes checked empty periods from unsupported branch scope", () => {
  const props = { alerts: [], status, periodStart: 202608, periodEnd: 202608 };
  expect(renderToStaticMarkup(createElement(AnomalyPanel, props))).toContain("No anomalies detected");
  const branch = renderToStaticMarkup(createElement(AnomalyPanel, { ...props, branch: true }));
  expect(branch).toContain("Branch-level anomaly attribution is unavailable");
  expect(branch).not.toContain("No anomalies detected");
});
