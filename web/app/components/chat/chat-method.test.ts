import { describe, expect, it } from "vitest";
import { CHAT_METHODS, canChangeMethod, defaultChatMethod, endpointFor } from "./chat-method";

describe("endpointFor", () => {
  it("sends Direct SQL to /api/chat-sql and Fixed functions to /api/chat", () => {
    expect(endpointFor("sql")).toBe("/api/chat-sql");
    expect(endpointFor("classic")).toBe("/api/chat");
  });

  it("has a distinct endpoint and label for each method", () => {
    expect(new Set(CHAT_METHODS.map((m) => m.endpoint)).size).toBe(CHAT_METHODS.length);
    expect(new Set(CHAT_METHODS.map((m) => m.label)).size).toBe(CHAT_METHODS.length);
  });
});

describe("defaultChatMethod", () => {
  it("starts on the method the app is configured for", () => {
    expect(defaultChatMethod("/api/chat-sql")).toBe("sql");
    expect(defaultChatMethod("/api/chat")).toBe("classic");
  });

  it("falls back to the original method for an unknown endpoint", () => {
    expect(defaultChatMethod("/something/else")).toBe("classic");
  });
});

describe("canChangeMethod", () => {
  it("allows a change only before the first question", () => {
    expect(canChangeMethod(0)).toBe(true);
    expect(canChangeMethod(1)).toBe(false);
    expect(canChangeMethod(6)).toBe(false);
  });
});
