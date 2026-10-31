"use client";

// Lets any part of the app hand a question to the floating assistant: the chat
// panel (chat-widget.tsx) listens for this event, opens and sends it. A window
// event keeps the panels decoupled from where the chat widget is mounted.

import { Sparkles } from "lucide-react";

export const ASK_ASSISTANT_EVENT = "finsight:ask-assistant";

export function askAssistant(question: string) {
  window.dispatchEvent(new CustomEvent(ASK_ASSISTANT_EVENT, { detail: { question } }));
}

/** Calls `handler` with each question asked from elsewhere in the app. Returns the unsubscribe. */
export function onAskAssistant(handler: (question: string) => void) {
  const listener = (event: Event) => {
    const question = (event as CustomEvent<{ question?: unknown }>).detail?.question;
    if (typeof question === "string" && question.trim()) handler(question.trim());
  };
  window.addEventListener(ASK_ASSISTANT_EVENT, listener);
  return () => window.removeEventListener(ASK_ASSISTANT_EVENT, listener);
}

export function AskAssistantButton({ question, label = "Ask the assistant", className = "" }: { question: string; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); askAssistant(question); }}
      title={question}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-blue/25 bg-white/80 px-3 py-1.5 text-xs font-semibold text-brand-navy shadow-sm transition hover:border-brand-blue/50 hover:bg-brand-blue-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${className}`}
    >
      <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-brand-blue" />
      {label}
    </button>
  );
}
