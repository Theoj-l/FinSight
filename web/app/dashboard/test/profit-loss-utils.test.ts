import { describe, expect, it } from "vitest";
import { aggregateProfitLoss, type PlFormatRow } from "../data/profit-loss-utils";

const formatRows: PlFormatRow[] = [
  { seq: 10, row_type: "H", acc_type: null, description: "Revenue", credit_as_positive: true },
  { seq: 20, row_type: "A", acc_type: "RE", description: "Revenue", credit_as_positive: true },
  { seq: 30, row_type: "S", acc_type: null, description: "Total Revenue", credit_as_positive: true },
  { seq: 40, row_type: "A", acc_type: "EX", description: "Operating Expenses", credit_as_positive: false },
  { seq: 50, row_type: "S", acc_type: null, description: "Profit Before Tax", credit_as_positive: true },
];

describe("profit loss utilities", () => {
  it("orders rows by PLFormat seq and preserves row types", () => {
    const result = aggregateProfitLoss(formatRows.slice().reverse(), [], [], 202402);
    expect(result.rows.map(({ rowType }) => rowType)).toEqual(["H", "A", "S", "A", "S"]);
  });

  it("leaves headers blank while preserving zero account balances", () => {
    const result = aggregateProfitLoss([
      { seq: 10, row_type: "H", acc_type: null, description: "Revenue", credit_as_positive: true },
      { seq: 20, row_type: "A", acc_type: "RE", description: "Sales", credit_as_positive: true },
    ], [], [], 202402);

    expect(result.rows[0].monthToDate).toBeUndefined();
    expect(result.rows[0].yearToDate).toBeUndefined();
    expect(result.rows[0].variancePct).toBeUndefined();
    expect(result.rows[1].monthToDate).toBe(0);
    expect(result.rows[1].yearToDate).toBe(0);
  });

  it("applies credit_as_positive sign handling and subtotal calculations", () => {
    const result = aggregateProfitLoss(formatRows, [
      { period_no: 202402, home_dr: 100, home_cr: 600, gl_mast: { acc_type: "RE" } },
      { period_no: 202402, home_dr: 125, home_cr: 0, gl_mast: { acc_type: "EX" } },
    ], [], 202402);
    expect(result.rows.map(({ monthToDate }) => monthToDate)).toEqual([undefined, 500, 500, 125, 375]);
  });

  it("keeps a subtotal sign aligned with its detail rows", () => {
    const result = aggregateProfitLoss([
      { seq: 10, row_type: "A", acc_type: "EX", description: "Operating Expenses", credit_as_positive: false },
      { seq: 20, row_type: "S", acc_type: null, description: "Total Operating Expenses", credit_as_positive: false },
    ], [
      { period_no: 202402, home_dr: 125, home_cr: 0, gl_mast: { acc_type: "EX" } },
    ], [], 202402);

    expect(result.rows[0].monthToDate).toBe(125);
    expect(result.rows[1].monthToDate).toBe(125);
  });

  it("does not expose seq in rows passed to the table", () => {
    const result = aggregateProfitLoss(formatRows, [], [], 202402);
    expect(result.rows.every((row) => !Object.prototype.hasOwnProperty.call(row, "seq"))).toBe(true);
  });

  it("calculates budget variance and returns null when budget is zero", () => {
    const result = aggregateProfitLoss(formatRows,
      [{ period_no: 202402, home_dr: 100, home_cr: 600, gl_mast: { acc_type: "RE" } }],
      [{ period_no: 202402, amount: -400, gl_mast: { acc_type: "RE" } }], 202402);
    expect(result.baseline).toBe("MTD actual versus MTD budget");
    expect(result.rows[1].variancePct).toBe(25);
    expect(result.rows[0].variancePct).toBeUndefined();
    expect(result.rows[3].variancePct).toBeNull();
  });
});