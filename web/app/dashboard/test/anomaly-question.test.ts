import { describe, expect, it } from "vitest";
import { anomalyQuestion } from "../data/anomalies-utils";

describe("anomalyQuestion", () => {
  const reasons = [
    "no receipt for 749 days (usually every 47)",
    "77% of unpaid invoices are 90+ days overdue.",
    "collected 0% of the last 90 days' billing;",
    "a fourth reason that is left out",
  ];

  it("lays the question out on lines: what, why (as bullets) and the ask", () => {
    expect(anomalyQuestion("Sembawang Development (S) Pte Ltd", "cust", "Aug 2026", reasons)).toBe(
      [
        "Explain this anomaly:",
        "Sembawang Development (S) Pte Ltd · Customer · Aug 2026",
        "",
        "Why it was flagged:",
        "• No receipt for 749 days (usually every 47)",
        "• 77% of unpaid invoices are 90+ days overdue",
        "• Collected 0% of the last 90 days' billing",
        "",
        "What could cause it, and what should I check?",
      ].join("\n"),
    );
  });

  it("leaves out the reasons section when there are none", () => {
    expect(anomalyQuestion("Transport", "dept", "May 2026", [])).not.toContain("Why it was flagged");
  });
});
