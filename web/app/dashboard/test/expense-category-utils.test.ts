import { describe, expect, it } from "vitest";
import {
  aggregateExpenseCategories,
  getCategoriesForPeriod,
} from "../data/expense-category-utils";

const row = (period_no: number, description: string | null, home_dr: number, home_cr = 0, acc_type = "EX") => ({
  period_no,
  home_dr,
  home_cr,
  gl_mast: { description, acc_type },
});

describe("expense category utilities", () => {
  it("groups EX rows by period and category and filters other account types", () => {
    expect(aggregateExpenseCategories([
      row(202401, "Rent", 100),
      row(202401, "Rent", 50),
      row(202401, "Sales", 20, 0, "RE"),
    ])).toEqual([{ periodNo: 202401, period: "2024-01", categories: [{ category: "Rent", amount: 150, priorAmount: null }] }]);
  });

  it("normalizes signed movements to positive expenses", () => {
    expect(aggregateExpenseCategories([row(202401, "Fees", 10, 100)]) [0].categories[0].amount).toBe(90);
  });

  it("normalizes the aggregated signed category movement", () => {
    expect(aggregateExpenseCategories([
      row(202401, "Fees", 100),
      row(202401, "Fees", 0, 25),
    ])[0].categories[0].amount).toBe(75);
  });

  it("aligns prior amounts and omits absent categories", () => {
    const data = aggregateExpenseCategories([
      row(202401, "Rent", 100),
      row(202401, "Utilities", 20),
      row(202402, "Rent", 125),
      row(202403, "Utilities", 30),
    ]);

    expect(data[1].categories).toEqual([{ category: "Rent", amount: 125, priorAmount: 100 }]);
    expect(data[2].categories).toEqual([{ category: "Utilities", amount: 30, priorAmount: null }]);
  });

  it("preserves period totals and supports period selection", () => {
    const data = aggregateExpenseCategories([row(202401, "Rent", 100), row(202401, "Utilities", 20)]);
    expect(data[0].categories.reduce((sum, category) => sum + category.amount, 0)).toBe(120);
    expect(getCategoriesForPeriod(data, 202401)).toEqual(data[0].categories);
    expect(getCategoriesForPeriod(data, 202402)).toEqual([]);
  });
});