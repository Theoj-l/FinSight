"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { EMPTY_REPLY_MESSAGE, ChatRequestError, describeChatError, streamChatReply } from "./chat-transport";
import { chatReducer, initialChatState, isStreaming, promptFor } from "./chat-state";

let sequence = 0;
// Only called from event handlers (never during render), so it can be impure.
// Deliberately not crypto.randomUUID(): that needs a secure context and would
// crash the widget on a plain-http dev URL.
const nextId = () => `m${Date.now().toString(36)}-${++sequence}`;

/** Conversation state plus the actions that drive a streamed reply. */
export function useChat() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  // The request that is currently in flight. Also the synchronous source of
  // truth for "is a reply streaming?" between renders.
  const abortRef = useRef<AbortController | null>(null);
  // Latest state for callbacks that must keep a stable identity (see retry).
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Cancel any in-flight request if the widget unmounts (e.g. on sign-out).
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (assistantId: string, prompt: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    let received = false;

    try {
      for await (const delta of streamChatReply(prompt, { signal: controller.signal })) {
        if (!delta) continue;
        received = true;
        dispatch({ type: "delta", id: assistantId, text: delta });
      }
      if (!received) throw new ChatRequestError(EMPTY_REPLY_MESSAGE);
      dispatch({ type: "finish", id: assistantId });
    } catch (error) {
      if (controller.signal.aborted) dispatch({ type: "stop", id: assistantId });
      else dispatch({ type: "fail", id: assistantId, error: describeChatError(error) });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  /** Send a question. Returns false if it was ignored (empty, or a reply is still streaming). */
  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || abortRef.current) return false;
      const assistantId = nextId();
      dispatch({ type: "send", text, userId: nextId(), assistantId });
      void run(assistantId, text);
      return true;
    },
    [run],
  );

  /** Re-ask the question behind a failed answer. */
  const retry = useCallback(
    (failedId: string) => {
      const prompt = promptFor(stateRef.current, failedId);
      if (!prompt || abortRef.current) return;
      const assistantId = nextId();
      dispatch({ type: "retry", failedId, assistantId });
      void run(assistantId, prompt);
    },
    [run],
  );

  /** Stop the reply that is currently streaming; the partial text is kept. */
  const stop = useCallback(() => abortRef.current?.abort(), []);

  /** Start a fresh conversation. */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "reset" });
  }, []);

  return { messages: state.messages, streaming: isStreaming(state), send, retry, stop, reset };
}
