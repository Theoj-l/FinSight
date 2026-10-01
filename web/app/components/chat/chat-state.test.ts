import { describe, expect, it } from "vitest";

import { chatReducer, initialChatState, isStreaming, promptFor, type ChatAction, type ChatState } from "./chat-state";

function run(actions: ChatAction[], from: ChatState = initialChatState): ChatState {
  return actions.reduce(chatReducer, from);
}

const ask: ChatAction = { type: "send", text: "How is revenue?", userId: "u1", assistantId: "a1" };

describe("chatReducer", () => {
  it("adds the question and a streaming placeholder answer", () => {
    expect(run([ask]).messages).toEqual([
      { id: "u1", role: "user", content: "How is revenue?", status: "done" },
      { id: "a1", role: "assistant", content: "", status: "streaming" },
    ]);
  });

  it("appends deltas in order and finishes", () => {
    const state = run([
      ask,
      { type: "delta", id: "a1", text: "Revenue " },
      { type: "delta", id: "a1", text: "rose." },
      { type: "finish", id: "a1" },
    ]);

    expect(state.messages[1]).toMatchObject({ content: "Revenue rose.", status: "done" });
    expect(isStreaming(state)).toBe(false);
  });

  it("reports streaming only while an answer is in flight", () => {
    expect(isStreaming(initialChatState)).toBe(false);
    expect(isStreaming(run([ask]))).toBe(true);
  });

  it("keeps partial text when stopped", () => {
    const state = run([ask, { type: "delta", id: "a1", text: "Revenue" }, { type: "stop", id: "a1" }]);
    expect(state.messages[1]).toMatchObject({ content: "Revenue", status: "stopped" });
  });

  it("keeps partial text and records the error on failure", () => {
    const state = run([ask, { type: "delta", id: "a1", text: "Revenue" }, { type: "fail", id: "a1", error: "Boom" }]);
    expect(state.messages[1]).toMatchObject({ content: "Revenue", status: "error", error: "Boom" });
  });

  it("ignores deltas that arrive after the answer has ended", () => {
    const state = run([ask, { type: "delta", id: "a1", text: "Hi" }, { type: "stop", id: "a1" }]);
    expect(chatReducer(state, { type: "delta", id: "a1", text: " late" }).messages[1].content).toBe("Hi");
  });

  it("replaces a failed answer in place on retry, keeping the question", () => {
    const failed = run([ask, { type: "fail", id: "a1", error: "Boom" }]);
    const retried = chatReducer(failed, { type: "retry", failedId: "a1", assistantId: "a2" });

    expect(retried.messages.map((m) => m.id)).toEqual(["u1", "a2"]);
    expect(retried.messages[1]).toEqual({ id: "a2", role: "assistant", content: "", status: "streaming" });
  });

  it("clears the conversation on reset", () => {
    expect(run([ask, { type: "reset" }])).toEqual(initialChatState);
  });

  it("ignores actions for unknown ids (a cancelled request reporting after reset)", () => {
    const state = run([ask]);
    expect(chatReducer(state, { type: "stop", id: "ghost" })).toBe(state);
    expect(chatReducer(state, { type: "delta", id: "ghost", text: "x" })).toBe(state);
  });

  it("only replaces the message that changed, so memoised bubbles skip re-rendering", () => {
    const before = run([ask]);
    const after = chatReducer(before, { type: "delta", id: "a1", text: "Hi" });

    expect(after.messages[0]).toBe(before.messages[0]);
    expect(after.messages[1]).not.toBe(before.messages[1]);
  });
});

describe("promptFor", () => {
  it("finds the question that produced an answer", () => {
    expect(promptFor(run([ask]), "a1")).toBe("How is revenue?");
  });

  it("returns undefined for user messages and unknown ids", () => {
    const state = run([ask]);
    expect(promptFor(state, "u1")).toBeUndefined();
    expect(promptFor(state, "ghost")).toBeUndefined();
  });
});
