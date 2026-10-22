// ---------------------------------------------------------------------------
// chat-state.ts — conversation state as a pure reducer (no React, no I/O).
// ---------------------------------------------------------------------------

import type { TourScript } from "../tour/tour-script";
import type { ChatContext } from "./chat-context";

export type MessageStatus = "streaming" | "done" | "stopped" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  /** Set when status is "error". Partial `content` is kept. */
  error?: string;
  /** Charts and tables on the page that help explain this answer. */
  walkthrough?: TourScript;
  /** The dashboard settings the walkthrough is written for. */
  scope?: ChatContext;
}

export interface ChatState {
  messages: ChatMessage[];
}

export type ChatAction =
  | { type: "send"; text: string; userId: string; assistantId: string }
  | { type: "retry"; failedId: string; assistantId: string }
  | { type: "delta"; id: string; text: string }
  | { type: "walkthrough"; id: string; script: TourScript; scope?: ChatContext | null }
  | { type: "finish"; id: string }
  | { type: "stop"; id: string }
  | { type: "fail"; id: string; error: string }
  | { type: "reset" };

export const initialChatState: ChatState = { messages: [] };

const streamingPlaceholder = (id: string): ChatMessage => ({
  id,
  role: "assistant",
  content: "",
  status: "streaming",
});

function update(state: ChatState, id: string, patch: (message: ChatMessage) => ChatMessage): ChatState {
  // Unknown ids are ignored: a cancelled request can report back after "reset".
  if (!state.messages.some((message) => message.id === id)) return state;
  return { messages: state.messages.map((message) => (message.id === id ? patch(message) : message)) };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "send":
      return {
        messages: [
          ...state.messages,
          { id: action.userId, role: "user", content: action.text, status: "done" },
          streamingPlaceholder(action.assistantId),
        ],
      };

    case "retry":
      // Replace the failed answer in place; the user's question stays as is.
      return update(state, action.failedId, () => streamingPlaceholder(action.assistantId));

    case "delta":
      return update(state, action.id, (message) =>
        message.status === "streaming" ? { ...message, content: message.content + action.text } : message,
      );

    case "walkthrough":
      return update(state, action.id, (message) => ({ ...message, walkthrough: action.script, scope: action.scope ?? undefined }));

    case "finish":
      return update(state, action.id, (message) => ({ ...message, status: "done" }));

    case "stop":
      return update(state, action.id, (message) => ({ ...message, status: "stopped" }));

    case "fail":
      return update(state, action.id, (message) => ({ ...message, status: "error", error: action.error }));

    case "reset":
      return initialChatState;
  }
}

export function isStreaming(state: ChatState): boolean {
  return state.messages.some((message) => message.status === "streaming");
}

/** The user message that produced the given assistant message, if any. */
export function promptFor(state: ChatState, assistantId: string): string | undefined {
  const index = state.messages.findIndex((message) => message.id === assistantId);
  const previous = index > 0 ? state.messages[index - 1] : undefined;
  return previous?.role === "user" ? previous.content : undefined;
}
