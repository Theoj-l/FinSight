import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { askAssistant, onAskAssistant } from "./ask-assistant";

beforeEach(() => { vi.stubGlobal("window", new EventTarget()); });
afterEach(() => { vi.unstubAllGlobals(); });

it("hands a question from anywhere in the app to the chat panel's listener", () => {
  const handler = vi.fn();
  const stop = onAskAssistant(handler);
  askAssistant("  Why did gross margin fall?  ");
  expect(handler).toHaveBeenCalledWith("Why did gross margin fall?");
  stop();
  askAssistant("again");
  expect(handler).toHaveBeenCalledTimes(1);
});

it("ignores empty or malformed questions", () => {
  const handler = vi.fn();
  onAskAssistant(handler);
  askAssistant("   ");
  window.dispatchEvent(new CustomEvent("finsight:ask-assistant", { detail: { question: 42 } }));
  expect(handler).not.toHaveBeenCalled();
});
