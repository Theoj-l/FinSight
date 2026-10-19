import { expect, it } from "vitest";
import {
  selectForecastReference,
  type ForecastReferenceRow as Row,
} from "./forecast-reference";
const r = (overrides: Partial<Row> = {}): Row => ({
  run_id: "1",
  kind: "forecast",
  dept_no: "HL",
  metric: "revenue",
  origin: 202607,
  period_no: 202608,
  yhat: "100",
  finished_at: "2026-07-31T12:00:00Z",
  ...overrides,
});
it("prefers genuine archived forecasts over reconstructed backtests", () => {
  const result = selectForecastReference(
    [
      r(),
      r({
        run_id: "2",
        kind: "backtest",
        yhat: "900",
        finished_at: "2026-10-01T00:00:00Z",
      }),
    ],
    ["HL"],
    202608,
    "revenue",
  );
  expect(result.value).toBe("100.0000");
  expect(result.note).toContain("Archived");
});
it("labels reconstruction honestly when an old forecast was only generated later", () => {
  const result = selectForecastReference(
    [
      r({ finished_at: "2026-10-01T00:00:00Z" }),
      r({ kind: "backtest", yhat: "80", finished_at: "2026-10-01T00:00:00Z" }),
    ],
    ["HL"],
    202608,
    "revenue",
  );
  expect(result.value).toBe("80.0000");
  expect(result.note).toContain("Reconstructed");
});
it("does not mix runs or silently sum incomplete departments", () => {
  expect(
    selectForecastReference(
      [r(), r({ run_id: "2", dept_no: "CP" })],
      ["HL", "CP"],
      202608,
      "revenue",
    ).value,
  ).toBeNull();
  expect(
    selectForecastReference(
      [r(), r({ dept_no: "CP", yhat: "25" })],
      ["HL", "CP"],
      202608,
      "revenue",
    ).value,
  ).toBe("125.0000");
});
it("rejects target-month training, invalid timestamps, duplicates and wrong metrics", () => {
  for (const rows of [
    [r({ origin: 202608 })],
    [r({ finished_at: "invalid" })],
    [r({ finished_at: null })],
    [r(), r()],
    [r({ metric: "cost" })],
  ])
    expect(
      selectForecastReference(rows, ["HL"], 202608, "revenue").value,
    ).toBeNull();
});
it("can select derived profit and keeps negative forecasts signed", () =>
  expect(
    selectForecastReference(
      [r({ metric: "profit", yhat: "-30" })],
      ["HL"],
      202608,
      "netProfit",
    ).value,
  ).toBe("-30.0000"));
