import { expect, it } from "vitest";
import { isBudgetId, validateWrite, money } from "./validation";
import { defaultRules } from "./types";
it.each([
  "",
  "1e5",
  "NaN",
  "Infinity",
  "1.12345",
  "1000000000000000",
  " 1 ",
  1,
  undefined,
])("rejects invalid money %s", (v) => expect(money(v)).toBe(false));
it.each([null, "0", "-10", "0.0001", "999999999999999.9999"])(
  "accepts explicit money or clear %s",
  (v) => expect(money(v)).toBe(true),
);
it("accepts valid settings/source/manual requests", () => {
  expect(validateWrite({ kind: "rules", rules: defaultRules() }).kind).toBe(
    "rules",
  );
  expect(validateWrite({ kind: "source", source: "auto" })).toEqual({
    kind: "source",
    source: "auto",
  });
  expect(
    validateWrite({
      kind: "manual",
      department: "HL",
      period: 202608,
      revenue: null,
      netProfit: "-10",
    }).kind,
  ).toBe("manual");
});
it("supports the full signed-bigint positive ID range without overflow or numeric coercion", () => {
  const max = "9223372036854775807";
  expect(isBudgetId(max)).toBe(true);
  expect(
    validateWrite({ kind: "source", source: "budget", budgetId: max }),
  ).toMatchObject({ budgetId: max });
  for (const invalid of [
    "9223372036854775808",
    "99999999999999999999",
    "-1",
    "1e2",
    9007199254740992,
  ]) {
    expect(isBudgetId(invalid)).toBe(false);
    expect(() =>
      validateWrite({ kind: "source", source: "budget", budgetId: invalid }),
    ).toThrow();
  }
});
it.each([
  { kind: "source", source: "bogus" },
  {
    kind: "manual",
    department: "HL",
    period: 202613,
    revenue: "1",
    netProfit: null,
  },
  {
    kind: "manual",
    department: "",
    period: 202608,
    revenue: "1",
    netProfit: null,
  },
  { kind: "scenario", name: " ".repeat(20) },
  {
    kind: "budget",
    department: "HL",
    period: 202608,
    budgetId: "-1",
    entries: [],
  },
  {
    kind: "budget",
    department: "HL",
    period: 202608,
    budgetId: "1",
    entries: [
      { account: "1", amount: "1" },
      { account: "1", amount: "2" },
    ],
  },
])("rejects invalid write %#", (v) => expect(() => validateWrite(v)).toThrow());
