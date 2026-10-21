import { describe, expect, it } from "vitest";
import { readChatContext } from "./chat-context";

describe("readChatContext", () => {
  it("is null on pages with nothing to point at", () => {
    expect(readChatContext("/home", "")).toBeNull();
    expect(readChatContext("/reports", "?period=202608")).toBeNull();
  });

  it("uses the dashboard defaults when no filters are in the address", () => {
    expect(readChatContext("/dashboard", "")).toEqual({ page: "dashboard", units: [], branches: [] });
  });

  it("reads a range, units and branches", () => {
    expect(readChatContext("/dashboard", "?periodStart=202606&periodEnd=202608&unit=A&unit=B&branch=KL")).toEqual({
      page: "dashboard",
      periodStart: "202606",
      periodEnd: "202608",
      units: ["A", "B"],
      branches: ["KL"],
    });
  });

  it("treats the older single `period` parameter as a one-month range", () => {
    expect(readChatContext("/dashboard", "?period=202608")).toEqual({
      page: "dashboard",
      periodStart: "202608",
      periodEnd: "202608",
      units: [],
      branches: [],
    });
  });

  it("ignores empty values", () => {
    expect(readChatContext("/dashboard", "?unit=&branch=")).toEqual({ page: "dashboard", units: [], branches: [] });
  });
});
