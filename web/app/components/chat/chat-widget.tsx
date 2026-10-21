"use client";

import { ArrowUp, MessageCircle, RotateCcw, Square, SquarePen, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { memo, useEffect, useRef, useState } from "react";
import { claimFirstVisit, useTour } from "../tour/tour-context";
import { WalkthroughCard } from "../tour/walkthrough-card";
import { readChatContext } from "./chat-context";
import type { ChatMessage } from "./chat-state";
import { CHAT_ENDPOINT, CHAT_MOCK_ENABLED, DEFAULT_CHAT_ENDPOINT } from "./chat-transport";
import { Markdown } from "./markdown-view";
import { useChat } from "./use-chat";

// Pages that render inside the signed-in app shell. Keep in sync with
// PROTECTED_PREFIXES in lib/supabase/proxy.ts. The chat API itself does not
// check auth, so the widget must never appear on public pages.
const APP_ROUTES = ["/home", "/dashboard", "/assistant", "/insights", "/reports", "/settings"];

const SUGGESTIONS = [
  "Which customer has the highest sales?",
  "What are our outstanding receivables?",
  "How did net profit change versus last month?",
];

// Offered on the dashboard, where the assistant can point at the charts and tables.
const WALKTHROUGH_QUESTION = "Walk me through this dashboard";

// First time on the dashboard, ask for the walkthrough automatically. Only where
// the answer can actually come with one: demo mode, or a backend that returns
// walkthroughs (/api/chat-sql). The original /api/chat does not, and would treat
// the question as an ordinary one.
const WALKTHROUGH_ON_FIRST_VISIT = CHAT_MOCK_ENABLED || CHAT_ENDPOINT !== DEFAULT_CHAT_ENDPOINT;

const MAX_INPUT_HEIGHT = 112;

function TypingDots({ spaced }: { spaced: boolean }) {
  return (
    <span aria-hidden="true" className={`inline-flex items-center gap-1 ${spaced ? "mt-2 flex" : ""}`}>
      {[0, 1, 2].map((dot) => (
        <span key={dot} className="chat-dot h-1.5 w-1.5 rounded-full bg-brand-blue" />
      ))}
    </span>
  );
}

// Memoised: the reducer only replaces the message that changed, so during a
// stream just the last bubble re-renders (and re-parses its Markdown).
const MessageBubble = memo(function MessageBubble({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry: (id: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand-navy px-3.5 py-2 text-sm leading-6 text-white">
          <span className="sr-only">You: </span>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      <div className="min-w-0 max-w-[92%] break-words rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-sm leading-6 text-foreground">
        <span className="sr-only">Assistant: </span>
        {message.content && <Markdown text={message.content} />}
        {message.status === "streaming" && <TypingDots spaced={message.content !== ""} />}
        {message.status === "stopped" && <p className="mt-1.5 text-xs text-muted">Stopped</p>}
        {message.status === "error" && (
          <div
            role="alert"
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800"
          >
            <span>{message.error}</span>
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand-blue"
            >
              <RotateCcw aria-hidden="true" className="h-3 w-3" />
              Try again
            </button>
          </div>
        )}
      </div>
      {message.walkthrough && message.status === "done" && (
        <div className="w-full">
          <WalkthroughCard messageId={message.id} script={message.walkthrough} />
        </div>
      )}
    </div>
  );
});

function ChatDock() {
  const tour = useTour();
  const { messages, streaming, send, retry, stop, reset } = useChat({
    // Read when a question is sent, so the answer matches what is on screen.
    getContext: () => readChatContext(window.location.pathname, window.location.search),
    // The answer is complete: start pointing at the charts and tables it mentions.
    onWalkthrough: (messageId, script) => {
      tour.begin(messageId, script);
    },
  });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true); // is the log scrolled to the bottom?

  // Opening the panel: focus the input and jump to the latest message.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
    pinnedRef.current = true;
  }, [open]);

  // Follow the stream (and the walkthrough card as it changes) unless the reader has scrolled up.
  const { status: tourStatus, stepIndex: tourStep } = tour.state;
  useEffect(() => {
    const log = logRef.current;
    if (open && log && pinnedRef.current) log.scrollTop = log.scrollHeight;
  }, [messages, open, tourStatus, tourStep]);

  // First visit to the dashboard: open the panel and ask for the walkthrough.
  // The timer (not a direct call) keeps this to one question under React's
  // dev-mode double effect, which would otherwise abort the first request.
  useEffect(() => {
    if (!WALKTHROUGH_ON_FIRST_VISIT || !tour.page) return;
    const timer = window.setTimeout(() => {
      if (!claimFirstVisit()) return;
      setOpen(true);
      send(WALKTHROUGH_QUESTION);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tour.page, send]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function submit(text: string) {
    if (!send(text)) return;
    setDraft("");
    pinnedRef.current = true;
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  return (
    <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-40 flex flex-col-reverse items-end gap-3 print:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-expanded={open}
        aria-controls="chat-panel"
        onClick={() => (open ? close() : setOpen(true))}
        className="grid h-14 w-14 place-items-center rounded-full bg-brand-navy text-white shadow-lg shadow-brand-navy/30 transition hover:bg-brand-navy-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue active:scale-95 motion-reduce:transition-none"
      >
        {open ? <X aria-hidden="true" className="h-6 w-6" /> : <MessageCircle aria-hidden="true" className="h-6 w-6" />}
      </button>

      {open && (
        <section
          id="chat-panel"
          role="dialog"
          aria-label="FinSight assistant"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          className="chat-pop flex h-[min(34rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-brand-navy/20"
        >
          <header className="flex items-center gap-3 bg-brand-navy px-4 py-3 text-white">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15">
              <MessageCircle aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">FinSight Assistant</p>
              <p className="truncate text-xs text-white/70">Profit &amp; loss · sales · receivables</p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                aria-label="New chat"
                title="New chat"
                className="grid h-8 w-8 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
              >
                <SquarePen aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="Close assistant"
              title="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </header>

          {CHAT_MOCK_ENABLED && (
            <p className="bg-amber-50 px-4 py-1.5 text-center text-[11px] font-medium leading-4 text-amber-800">
              Demo mode — sample answers, not real data
            </p>
          )}

          <div
            ref={logRef}
            role="log"
            aria-label="Conversation"
            aria-live="polite"
            aria-busy={streaming}
            onScroll={(event) => {
              const log = event.currentTarget;
              pinnedRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
            }}
            className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-width:thin]"
          >
            {messages.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center text-center">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-blue-light text-brand-navy">
                  <MessageCircle aria-hidden="true" className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-semibold text-brand-navy">How can I help?</p>
                <p className="mt-1 text-xs leading-5 text-muted">Ask about profit &amp; loss, sales, or receivables.</p>
                <div className="mt-4 flex w-full flex-col gap-2">
                  {(tour.page ? [WALKTHROUGH_QUESTION, ...SUGGESTIONS] : SUGGESTIONS).map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => submit(question)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-5 text-brand-navy transition hover:border-brand-blue/40 hover:bg-brand-blue-light/60 focus-visible:outline-2 focus-visible:outline-brand-blue"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} onRetry={retry} />
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit(draft);
            }}
            className="border-t border-slate-200 p-3"
          >
            <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-1.5 focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-brand-blue/20">
              <textarea
                ref={inputRef}
                value={draft}
                rows={1}
                maxLength={1000}
                aria-label="Message"
                placeholder="Ask about your finances…"
                onChange={(event) => {
                  setDraft(event.target.value);
                  const input = event.currentTarget;
                  input.style.height = "auto";
                  input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT)}px`;
                }}
                onKeyDown={(event) => {
                  // isComposing: don't send while an IME candidate is being confirmed.
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submit(draft);
                  }
                }}
                className="max-h-28 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted/70"
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop generating"
                  title="Stop"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-navy text-white transition hover:bg-brand-navy-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
                >
                  <Square aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Send message"
                  title="Send"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-navy text-white transition hover:bg-brand-navy-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <ArrowUp aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] leading-4 text-muted">
              AI-generated answers — verify important figures.
            </p>
          </form>
        </section>
      )}
    </div>
  );
}

/** Floating assistant: a circle at the bottom-right that opens a chat panel. */
export function ChatWidget() {
  const pathname = usePathname();
  const inApp = APP_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  // Unmounting on public routes (e.g. after sign-out) also clears the conversation.
  return inApp ? <ChatDock /> : null;
}
