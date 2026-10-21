// ---------------------------------------------------------------------------
// chat-transport.ts — sends a question to the chat API and yields the answer
// as an async stream of text deltas.
//
// The transport looks at the response Content-Type, so the UI never has to
// change when the backend starts streaming:
//
//   text/event-stream  real streaming, Gemini-shaped SSE (see stream-parser.ts)
//   text/plain         real streaming, raw text chunks
//   application/json   what POST /api/chat returns today: { reply, ... }.
//                      The whole reply is already here, so it is revealed
//                      progressively on the client (simulateStream) to keep the
//                      same streaming UX until the server streams for real.
//
// Optional extras (JSON replies and demo mode only for now):
//   request  `context`      which dashboard period/filters the user is looking at
//   response `walkthrough`  { opening, steps: [{ label, explanation }] } — which
//                           charts/tables to point at while explaining. It is
//                           validated, and handed to `onWalkthrough` once the
//                           text has finished.
// ---------------------------------------------------------------------------

import type { TourScript } from "../tour/tour-script";
import { parseTourScript } from "../tour/tour-script";
import type { ChatContext } from "./chat-context";
import { mockReplyFor, mockWalkthroughFor } from "./mock-replies";
import { StreamError, parseSseStream, readTextStream } from "./stream-parser";

/**
 * Where questions go. Defaults to /api/chat. Set NEXT_PUBLIC_CHAT_ENDPOINT=/api/chat-sql
 * in web/.env (and restart the dev server) to use the text-to-SQL backend, which also
 * returns walkthroughs. The property access must stay literal for Next to inline it.
 */
export const DEFAULT_CHAT_ENDPOINT = "/api/chat";
export const CHAT_ENDPOINT = process.env.NEXT_PUBLIC_CHAT_ENDPOINT || DEFAULT_CHAT_ENDPOINT;

/**
 * Demo mode: answer with canned, streamed replies and never call the API.
 * Set NEXT_PUBLIC_CHAT_MOCK=true in web/.env and restart the dev server.
 * (NEXT_PUBLIC_* values are inlined at build time, so on Vercel / in Docker it
 * is fixed per build.) The property access must stay literal for Next to inline it.
 */
export const CHAT_MOCK_ENABLED = process.env.NEXT_PUBLIC_CHAT_MOCK === "true";

/** Pretend the classify + retrieve steps take a moment before the first token. */
const MOCK_LATENCY_MS = 700;

/** Give up if the whole request takes longer than this. */
const REQUEST_TIMEOUT_MS = 60_000;

/** A chat failure with a message that is safe to show to the user. */
export class ChatRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ChatRequestError";
    this.status = status;
  }
}

export const EMPTY_REPLY_MESSAGE = "The assistant returned an empty reply.";
const GENERIC_MESSAGE = "The assistant ran into a problem. Please try again.";
const TIMEOUT_MESSAGE = "The assistant took too long to respond. Please try again.";
const NETWORK_MESSAGE = "Can't reach the assistant. Check your connection and try again.";

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return "Your session has expired. Please sign in again.";
  if (status === 422) return "I couldn't understand that question. Try rephrasing it.";
  if (status === 429) return "The assistant is busy right now. Please try again in a moment.";
  return GENERIC_MESSAGE;
}

// ── Simulated streaming (JSON fallback) ─────────────────────────────────────

const SIMULATION_BUDGET_MS = 1200; // never make a finished answer feel slow
const MAX_TICKS = 60;

export interface SimulateOptions {
  signal?: AbortSignal;
  /** Injectable so tests don't have to wait. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Reveal an already-complete reply in word-sized pieces, like a real stream. */
export async function* simulateStream(
  text: string,
  { signal, sleep = abortableSleep }: SimulateOptions = {},
): AsyncGenerator<string> {
  const pieces = text.match(/\S+\s*|\s+/g) ?? [];
  if (pieces.length === 0) return;

  const perTick = Math.max(1, Math.ceil(pieces.length / MAX_TICKS));
  const ticks = Math.ceil(pieces.length / perTick);
  const delay = Math.min(30, Math.max(4, Math.floor(SIMULATION_BUDGET_MS / ticks)));

  for (let i = 0; i < pieces.length; i += perTick) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    yield pieces.slice(i, i + perTick).join("");
    if (i + perTick < pieces.length) await sleep(delay, signal);
  }
}

// ── Demo mode ───────────────────────────────────────────────────────────────

async function* streamMockReply(message: string, signal: AbortSignal | undefined, latencyMs: number) {
  await abortableSleep(latencyMs, signal);
  const reply = mockReplyFor(message);
  if (reply === null) throw new ChatRequestError("This is a simulated error (demo mode). Try again.");
  yield* simulateStream(reply, { signal });
}

// ── Transport ───────────────────────────────────────────────────────────────

export interface StreamChatOptions {
  signal?: AbortSignal;
  endpoint?: string;
  /** Reveal JSON replies progressively. Default true. */
  simulate?: boolean;
  timeoutMs?: number;
  /** Use canned replies instead of the API. Defaults to CHAT_MOCK_ENABLED. */
  mock?: boolean;
  mockLatencyMs?: number;
  /** What the user is looking at; sent to the server when present. */
  context?: ChatContext | null;
  /** Called once, after the reply text, if the answer comes with a valid walkthrough. */
  onWalkthrough?: (script: TourScript) => void;
}

async function errorFromResponse(response: Response): Promise<ChatRequestError> {
  // The server's `details` can contain internals, so it is never shown — only
  // logged (in the browser console) to help whoever is debugging. `warn`, not
  // `error`: this failure is handled, and Next's dev overlay turns every
  // console.error into a red "Issue" badge.
  const body: unknown = await response.json().catch(() => null);
  if (body) console.warn("Chat request failed:", response.status, body);
  return new ChatRequestError(messageForStatus(response.status), response.status);
}

/**
 * POST the question and yield the answer as text deltas.
 * Rejects with ChatRequestError (safe to display), or the original AbortError
 * when the caller's signal is aborted.
 */
export async function* streamChatReply(
  message: string,
  {
    signal,
    endpoint = CHAT_ENDPOINT,
    simulate = true,
    timeoutMs = REQUEST_TIMEOUT_MS,
    mock = CHAT_MOCK_ENABLED,
    mockLatencyMs = MOCK_LATENCY_MS,
    context,
    onWalkthrough,
  }: StreamChatOptions = {},
): AsyncGenerator<string> {
  if (mock) {
    yield* streamMockReply(message, signal, mockLatencyMs);
    const walkthrough = mockWalkthroughFor(message);
    if (walkthrough) onWalkthrough?.(walkthrough);
    return;
  }

  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, text/plain;q=0.9, application/json;q=0.8",
        },
        body: JSON.stringify(context ? { message, context } : { message }),
        signal: combined,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ChatRequestError(timeout.aborted ? TIMEOUT_MESSAGE : NETWORK_MESSAGE);
    }

    if (!response.ok) throw await errorFromResponse(response);

    const contentType = response.headers.get("content-type") ?? "";

    if (response.body && contentType.includes("text/event-stream")) {
      yield* parseSseStream(response.body);
      return;
    }
    if (response.body && contentType.includes("text/plain")) {
      yield* readTextStream(response.body);
      return;
    }

    // application/json — the non-streaming endpoint that exists today.
    const data: unknown = await response.json().catch(() => null);
    const reply =
      typeof data === "object" && data !== null && "reply" in data && typeof data.reply === "string"
        ? data.reply
        : "";
    if (!reply.trim()) throw new ChatRequestError(EMPTY_REPLY_MESSAGE);

    if (simulate) yield* simulateStream(reply, { signal: combined });
    else yield reply;

    const walkthrough = parseTourScript((data as { walkthrough?: unknown }).walkthrough);
    if (walkthrough) onWalkthrough?.(walkthrough);
  } catch (error) {
    if (signal?.aborted) throw error; // the caller cancelled — pass it through untouched
    if (error instanceof ChatRequestError) throw error;
    if (timeout.aborted) throw new ChatRequestError(TIMEOUT_MESSAGE);
    if (error instanceof StreamError) throw new ChatRequestError(error.message);
    throw new ChatRequestError(GENERIC_MESSAGE);
  }
}

/** Message to show for any error thrown while reading a chat reply. */
export function describeChatError(error: unknown): string {
  return error instanceof ChatRequestError ? error.message : GENERIC_MESSAGE;
}
