import { expect, it } from "vitest";
import { aggregateForecastRows } from "../data/forecast-coverage";
import { buildSeries } from "../data/forecast-utils";
const row = (dept_no: string, yhat = 100, actual: number | null = 80) => ({dept_no, yhat, actual, kind: "backtest", metric: "revenue", origin: 202601, period_no: 202602, horizon: 1});
it("sums aligned actuals and predictions before measuring group accuracy", () => {
  const {rows, missing} = aggregateForecastRows([row("HL",100,80),row("CP",100,120)], ["HL","CP"]);
  expect(missing).toEqual([]);
  expect(rows[0]).toMatchObject({yhat:200,actual:200});
  expect(buildSeries("revenue",rows,[],202602,15).accuracy.mape).toBe(0);
});
it("omits partial points and identifies Corporate as missing", () => {
  expect(aggregateForecastRows([row("HL")],["HL","CP"])).toEqual({rows:[],missing:["CP"]});
});
it("does not mix origins or metrics to complete coverage", () => {
  const result=aggregateForecastRows([row("HL"),{...row("CP"),origin:202512}],["HL","CP"]);
  expect(result.rows).toEqual([]); expect(result.missing).toEqual(["CP","HL"]);
});
it("rejects duplicate rows and missing backtest actuals", () => {
  expect(aggregateForecastRows([row("HL"),row("HL")],["HL"]).rows).toEqual([]);
  expect(aggregateForecastRows([row("HL",100,null)],["HL"]).rows).toEqual([]);
});
it("allows future predictions without actuals and preserves zero and negatives", () => {
  const result=aggregateForecastRows([{...row("HL",0,null),kind:"forecast"},{...row("CP",-10,null),kind:"forecast"}],["HL","CP"]);
  expect(result.rows[0]).toMatchObject({yhat:-10,actual:null});
});
it("reports entirely missing results and never invents an empty total", () => {
  expect(aggregateForecastRows([],["CP"]).missing).toEqual(["CP"]);
  expect(aggregateForecastRows([row("HL")],[]).rows).toEqual([]);
});
