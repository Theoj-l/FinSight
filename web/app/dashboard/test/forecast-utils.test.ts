import { describe, expect, it } from "vitest";
import {
  accuracy, addMonths, band, buildSeries, historyFromBalances, quantile, relativeErrors, type ForecastRow,
} from "@/app/dashboard/data/forecast-utils";

function row(overrides: Partial<ForecastRow> = {}): ForecastRow {
  return { kind: "backtest", metric: "revenue", origin: 202607, period_no: 202608, horizon: 1, yhat: 100, actual: 100, ...overrides };
}

describe("addMonths", () => {
  it("crosses year boundaries in both directions", () => {
    expect(addMonths(202608, 1)).toBe(202609);
    expect(addMonths(202612, 1)).toBe(202701);
    expect(addMonths(202601, -1)).toBe(202512);
    expect(addMonths(202608, -12)).toBe(202508);
  });
});

describe("quantile", () => {
  it("interpolates linearly like numpy", () => {
    const values = Array.from({ length: 21 }, (_, i) => -0.1 + i * 0.01);
    expect(quantile(values, 0.1)).toBeCloseTo(-0.08);
    expect(quantile(values, 0.9)).toBeCloseTo(0.08);
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe("historyFromBalances", () => {
  it("turns credit-minus-debit movements into revenue, cost and net profit", () => {
    const history = historyFromBalances([
      { period_no: 202608, acc_type: "RE", net_cr: 1000 },
      { period_no: 202608, acc_type: "CS", net_cr: -600 },
      { period_no: 202608, acc_type: "EX", net_cr: -250 },
      { period_no: 202608, acc_type: "OI", net_cr: 10 },
      { period_no: 202607, acc_type: "RE", net_cr: 900 },
    ]);
    expect(history.revenue).toEqual([{ periodNo: 202607, actual: 900 }, { periodNo: 202608, actual: 1000 }]);
    expect(history.cost.at(-1)).toEqual({ periodNo: 202608, actual: 850 });
    expect(history.profit.at(-1)).toEqual({ periodNo: 202608, actual: 160 });
  });
});

describe("band", () => {
  it("applies the 10th-90th percentile of past relative errors at the same horizon", () => {
    const backtest = Array.from({ length: 21 }, (_, i) => row({ horizon: 2, yhat: 100, actual: 90 + i }));
    const errors = relativeErrors(backtest, 2);
    expect(band(200, errors).low).toBeCloseTo(184);
    expect(band(200, errors).high).toBeCloseTo(216);
    expect(relativeErrors(backtest, 1)).toEqual([]);
    expect(band(200, [])).toEqual({ low: null, high: null });
  });

  it("widens around a negative forecast instead of inverting", () => {
    const { low, high } = band(-100, [-0.1, 0.1]);
    expect(low!).toBeLessThan(-100);
    expect(high!).toBeGreaterThan(-100);
  });
});

describe("accuracy", () => {
  it("scores 1-month-ahead forecasts over the last 12 closed months against the target", () => {
    const backtest = [
      row({ period_no: 202608, yhat: 110, actual: 100 }),   // 10%
      row({ period_no: 202607, yhat: 80, actual: 100 }),    // 20%
      row({ period_no: 202508, yhat: 0, actual: 100 }),     // 13 months back: excluded
      row({ period_no: 202608, horizon: 2, yhat: 0 }),      // not 1-month-ahead: excluded
    ];
    const result = accuracy(backtest, 202608);
    expect(result).toMatchObject({ months: 2, wape: 15, mae: 15, targetMape: 15 });
    expect(result.mape).toBeCloseTo(15);
    expect(result.meetsTarget).toBe(true);      // exactly on the target counts as meeting it
    expect(accuracy(backtest, 202608, 12).meetsTarget).toBe(false);
  });

  it("is undecided without a backtest, and skips zero actuals in MAPE only", () => {
    expect(accuracy([], 202608).meetsTarget).toBeNull();
    const result = accuracy([row({ actual: 0, yhat: 5 }), row({ period_no: 202607, actual: 100, yhat: 90 })], 202608);
    expect(result.mape).toBeCloseTo(10);
    expect(result.mae).toBeCloseTo(7.5);
  });
});

describe("buildSeries", () => {
  it("puts the forecast after the last closed month with a band, and past forecasts beside actuals", () => {
    const rows: ForecastRow[] = [
      row({ kind: "forecast", origin: 202608, period_no: 202609, horizon: 1, yhat: 120, actual: null }),
      row({ kind: "forecast", origin: 202608, period_no: 202610, horizon: 2, yhat: 130, actual: null }),
      row({ period_no: 202608, yhat: 95, actual: 100 }),
      row({ period_no: 202607, origin: 202606, yhat: 105, actual: 100 }),
      row({ metric: "cost", kind: "forecast", origin: 202608, period_no: 202609, yhat: 1, actual: null }),
    ];
    const series = buildSeries("revenue", rows, [{ periodNo: 202608, actual: 100 }], 202608);
    expect(series.label).toBe("Revenue");
    expect(series.forecast.map(point => [point.periodNo, point.horizon, point.value])).toEqual([[202609, 1, 120], [202610, 2, 130]]);
    expect(series.forecast[0].low).not.toBeNull();
    expect(series.forecast[1]).toMatchObject({ low: null, high: null });   // no horizon-2 backtest
    expect(series.pastForecasts).toEqual([{ periodNo: 202608, forecast: 95, actual: 100 }]);   // 202607 is before the window
    expect(series.accuracy.months).toBe(2);
  });
});
