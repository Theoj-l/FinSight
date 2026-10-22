import { describe, expect, it } from "vitest";
import { readChatContext } from "./chat-context";

describe("readChatContext", () => {
  it("is page 'other' on pages with nothing to point at", () => {
    expect(readChatContext("/reports", "?period=202608")).toEqual({ page: "other", units: [], branches: [] });
    expect(readChatContext("/assistant", "")).toEqual({ page: "other", units: [], branches: [] });
  });

  it("knows the home page, which has no filters, and the forecast page, which has no period", () => {
    expect(readChatContext("/home", "?unit=A")).toEqual({ page: "home", units: [], branches: [] });
    expect(readChatContext("/forecast", "?periodStart=202606&unit=A&branch=KL")).toEqual({ page: "forecast", units: ["A"], branches: ["KL"] });
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
