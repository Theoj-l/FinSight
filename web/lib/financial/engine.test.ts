import { describe, expect, it } from "vitest";
import {
  compareValue,
  compareValues,
  emptyValues,
  sumComplete,
  validRules,
  valuesFrom,
} from "./engine";
import {
  METRICS,
  addMonth,
  defaultRules,
  notificationId,
  isPeriod,
  isSource,
} from "./types";
import { financialAlerts } from "./alerts";
import { financialFixture } from "@/tests/fixtures/financial";
import { comparisonKpis } from "./presentation";
import { chartValues } from "./chart-values";
import { formatAmount } from "@/app/dashboard/data/kpi-presentation";
import {
  clearNotifications,
  defaultNotificationPreferences,
  deliverNotifications,
  restoreInbox,
  viewNotifications,
} from "@/lib/notifications";
const rule = { enabled: true, tolerance: 10 };
describe("financial comparison decimal arithmetic", () => {
  it.each([
    ["revenue", "90", "100", false, true, -10],
    ["revenue", "89.9999", "100", true, true, -10.0001],
    ["revenue", "150", "100", false, false, 50],
    ["operatingExpenses", "110", "100", false, true, 10],
    ["operatingExpenses", "111", "100", true, true, 11],
    ["operatingExpenses", "50", "100", false, false, -50],
    ["netProfit", "-120", "-100", true, true, -20],
    ["netProfit", "-50", "-100", false, false, 50],
    ["netProfit", "10", "-100", false, false, 110],
    ["grossMargin", "18", "20", false, true, -10],
    ["expenseRatio", "22.1", "20", true, true, 10.5],
    ["revenue", "2.7", "3", false, true, -10],
  ] as const)(
    "%s actual %s vs %s has correct direction and boundary",
    (metric, actual, ref, breach, unfavorable, percentage) => {
      const c = compareValue(metric, actual, ref, rule);
      expect(c.breach).toBe(breach);
      expect(c.unfavorable).toBe(unfavorable);
      expect(c.percentage).toBeCloseTo(percentage, 8);
    },
  );
  it.each([
    [null, "100"],
    ["100", null],
    [null, null],
    ["10", "0"],
    ["-10", "0"],
  ])(
    "does not invent a percentage for unavailable/zero references (%s, %s)",
    (a, b) => {
      const c = compareValue("revenue", a, b, rule);
      expect(c.percentage).toBeNull();
      expect(c.breach).toBe(false);
    },
  );
  it("handles zero/zero, disabled rules, and all favorable metric directions", () => {
    expect(compareValue("revenue", "0", "0", rule).percentage).toBe(0);
    expect(
      compareValue("revenue", "1", "100", { enabled: false, tolerance: 0 })
        .breach,
    ).toBe(false);
    for (const [key, definition] of Object.entries(METRICS))
      expect(
        compareValue(
          key as keyof typeof METRICS,
          definition.higher ? "200" : "50",
          "100",
          { enabled: true, tolerance: 0 },
        ).breach,
      ).toBe(false);
  });
  it("preserves decimal precision and rejects incomplete sums", () => {
    expect(sumComplete(["999999999999999.9999", "0.0001"])).toBe(
      "1000000000000000.0000",
    );
    expect(sumComplete(["0.1", "0.2"])).toBe("0.3000");
    expect(sumComplete(["1", null])).toBeNull();
    expect(sumComplete([])).toBeNull();
  });
  it("derives reconciling profits and ratios without fabricated missing components", () => {
    const v = valuesFrom({ RE: "100", CS: "30", OI: "5", EX: "20" });
    expect(v.grossProfit).toBe("70.0000");
    expect(v.netProfit).toBe("55.0000");
    expect(v.netMargin).toBe("55.0000");
    expect(v.expenseRatio).toBe("20.0000");
    const partial = valuesFrom({ RE: "100", CS: null, OI: "5", EX: "20" });
    expect(partial.grossProfit).toBeNull();
    expect(partial.netProfit).toBeNull();
    expect(partial.revenue).toBe("100");
    expect(
      valuesFrom({ RE: "0", CS: "5", OI: "0", EX: "0" }).grossMargin,
    ).toBeNull();
    expect(
      valuesFrom({ RE: "-100", CS: "5", OI: "0", EX: "0" }).grossMargin,
    ).toBeNull();
  });
  it("rounds display values without losing large decimal amounts", () => {
    expect(formatAmount("999999999999999.9999", "money")).toBe(
      "S$1,000,000,000,000,000.00",
    );
    expect(formatAmount("-25.0050", "money")).toBe("−S$25.01");
    expect(formatAmount("12.3456", "ratio")).toBe("12.35%");
  });
});
describe("rules, calendar and source validation", () => {
  it.each([
    [202601, -1, 202512],
    [202512, 1, 202601],
    [202401, -13, 202212],
    [202412, 12, 202512],
  ])("moves %s by %s calendar months", (p, n, want) =>
    expect(addMonth(p, n)).toBe(want),
  );
  it.each([202600, 202613, 20261, 202601.5, NaN, Infinity])(
    "rejects invalid reporting month %s",
    (p) => expect(isPeriod(p)).toBe(false),
  );
  it("validates complete shared rules and known sources", () => {
    const rules = defaultRules();
    expect(validRules(rules)).toBe(true);
    expect(isSource("previous")).toBe(true);
    expect(isSource("unknown")).toBe(false);
    for (const value of [-1, NaN, Infinity, 1000001])
      expect(
        validRules({ ...rules, revenue: { enabled: true, tolerance: value } }),
      ).toBe(false);
    expect(validRules({ revenue: rule })).toBe(false);
    expect(validRules({ ...rules, extra: rule })).toBe(false);
  });
});
describe("one calculation shared by views and notifications", () => {
  it.each(["previous", "budget", "auto", "manual"] as const)(
    "preserves actuals and shares %s reference/breach",
    (source) => {
      const b = financialFixture(),
        kpis = comparisonKpis(b, source),
        point = b.sources[source][b.period];
      const alerts = financialAlerts(kpis);
      // Ledger metrics only: the derived Total expenses card is covered in presentation.test.ts.
      for (const metric of kpis.metrics.filter((m) => m.id in METRICS)) {
        expect(metric.value).toBe(
          b.sources.previous[b.period].metrics[
            metric.id as keyof typeof METRICS
          ].actual,
        );
        expect(metric.prior).toBe(
          point.metrics[metric.id as keyof typeof METRICS].reference,
        );
        expect(alerts.some((a) => a.metric.id === metric.id)).toBe(
          metric.comparison?.breach,
        );
      }
      const chart = chartValues(point);
      expect(chart.revenue).toBe(Number(point.metrics.revenue.actual));
      expect(chart.referenceRevenue).toBe(
        Number(point.metrics.revenue.reference),
      );
      expect(chart.referenceNetProfit).toBe(
        Number(point.metrics.netProfit.reference),
      );
      expect(chart.referenceExpenses).toBe(
        point.metrics.operatingExpenses.reference === null
          ? null
          : Number(point.metrics.operatingExpenses.reference),
      );
      expect(kpis.metrics.some((m) => m.id === "budgetVariance")).toBe(false);
    },
  );
  it("keeps unsupported forecast ratios unavailable instead of using another source", () => {
    const b = financialFixture();
    const point = b.sources.auto[b.period];
    expect(point.metrics.grossProfit.reference).toBeNull();
    expect(point.metrics.operatingExpenses.reference).toBeNull();
    expect(point.metrics.netMargin.reference).toBeNull();
  });
  it("changes notification identity for meaningful source/reference/rule/actual changes", () => {
    const c = compareValue("revenue", "80", "100", rule),
      id = notificationId("2026-08", "revenue", "previous", c);
    expect(notificationId("2026-08", "revenue", "previous", { ...c })).toBe(id);
    for (const update of [
      { reference: "120" },
      { actual: "70" },
      { tolerance: 5 },
      { enabled: false },
    ])
      expect(
        notificationId("2026-08", "revenue", "previous", { ...c, ...update }),
      ).not.toBe(id);
    expect(notificationId("2026-08", "revenue", "budget", c)).not.toBe(id);
    expect(notificationId("2026-09", "revenue", "previous", c)).not.toBe(id);
  });
  it("does not generate future actuals or actual-based alerts", () => {
    const point = compareValues(
      emptyValues(),
      valuesFrom({ RE: "100", CS: "10", OI: "0", EX: "0" }),
      defaultRules(),
    );
    expect(
      Object.values(point).every(
        (c) => c.actual === null && c.percentage === null && !c.breach,
      ),
    ).toBe(true);
  });
  it("notifies unfavorable expense deviations using the same P&L/chart rules, and respects disabling", () => {
    const b = financialFixture(),
      p = b.sources.budget[b.period];
    p.metrics.operatingExpenses = compareValue(
      "operatingExpenses",
      "200",
      "100",
      rule,
    );
    expect(
      financialAlerts(comparisonKpis(b, "budget")).find(
        (a) => a.metric.id === "operatingExpenses",
      )?.comparison,
    ).toBe(p.metrics.operatingExpenses);
    p.metrics.operatingExpenses = compareValue(
      "operatingExpenses",
      "200",
      "100",
      { enabled: false, tolerance: 10 },
    );
    expect(
      financialAlerts(comparisonKpis(b, "budget")).some(
        (a) => a.metric.id === "operatingExpenses",
      ),
    ).toBe(false);
  });
  it("deduplicates a cleared deviation but delivers a materially changed reference as a new issue", () => {
    const b = financialFixture(),
      first = financialAlerts(comparisonKpis(b, "previous"))[0];
    const now = "2026-09-01T00:00:00Z",
      later = "2026-09-02T00:00:00Z";
    const inbox = clearNotifications(
      viewNotifications(
        deliverNotifications(
          restoreInbox(null),
          [first.id],
          defaultNotificationPreferences,
          now,
        ),
        [first.id],
        now,
      ),
      [first.id],
      now,
    );
    expect(
      deliverNotifications(
        inbox,
        [first.id],
        defaultNotificationPreferences,
        later,
      ),
    ).toBe(inbox);
    b.sources.previous[b.period].metrics.revenue = compareValue(
      "revenue",
      "100",
      "300",
      rule,
    );
    const changed = financialAlerts(comparisonKpis(b, "previous"))[0];
    expect(changed.id).not.toBe(first.id);
    const delivered = deliverNotifications(
      inbox,
      [changed.id],
      defaultNotificationPreferences,
      later,
    );
    expect(delivered.entries[first.id].clearedAt).toBe(now);
    expect(delivered.entries[changed.id].clearedAt).toBeUndefined();
  });
});
