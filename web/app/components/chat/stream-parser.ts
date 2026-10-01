// ---------------------------------------------------------------------------
// stream-parser.ts — turns a streaming HTTP body into text deltas.
//
// Pure functions, no React and no fetch, so they can be unit-tested in Node.
//
// The shapes understood here come from Gemini's streaming docs
// (https://ai.google.dev/api/generate-content, "streamGenerateContent"):
//
//  * SDK:  ai.models.generateContentStream() yields GenerateContentResponse
//          chunks. `candidates[0].content.parts[].text` is ONLY the new delta
//          for that chunk (not cumulative), and the last chunk carries
//          finishReason / usageMetadata with no text.
//  * REST: POST models/{model}:streamGenerateContent?alt=sse sends each of
//          those chunks as one Server-Sent Event: `data: <JSON>\n\n`.
//  * Newer Interactions API: events like
//          { event_type: "step.delta", delta: { type: "text", text } }.
//
// A backend route that pipes Gemini's stream straight through (or a thin
// { text } / { delta } wrapper around it) therefore works unchanged.
// ---------------------------------------------------------------------------

/** A failure reported *inside* the stream (error event, safety block, ...). */
export class StreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamError";
  }
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (isObject(error) && typeof error.message === "string" && error.message) return error.message;
  return "The response stream failed.";
}

/**
 * Pull the *new* text out of one decoded stream payload.
 * Returns "" for payloads that carry no text (usage / finish metadata).
 * Throws StreamError for error payloads and blocked prompts.
 */
export function extractDelta(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!isObject(payload)) return "";

  if (payload.error) throw new StreamError(errorMessage(payload.error));

  // Gemini: a blocked prompt has promptFeedback.blockReason and no candidates.
  const feedback = payload.promptFeedback;
  if (isObject(feedback) && typeof feedback.blockReason === "string") {
    throw new StreamError("The assistant couldn't answer that request.");
  }

  // Gemini generateContent chunk / streamGenerateContent SSE event.
  if (Array.isArray(payload.candidates)) {
    const first = payload.candidates[0];
    const parts = isObject(first) && isObject(first.content) ? first.content.parts : undefined;
    if (!Array.isArray(parts)) return "";
    let text = "";
    for (const part of parts) {
      // Skip "thought" summaries — the SDK's `.text` getter does the same.
      if (isObject(part) && typeof part.text === "string" && part.thought !== true) {
        text += part.text;
      }
    }
    return text;
  }

  // Gemini Interactions API.
  if (payload.event_type === "step.delta" && isObject(payload.delta)) {
    const { type, text } = payload.delta;
    return type === "text" && typeof text === "string" ? text : "";
  }

  // App-level wrappers.
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.delta === "string") return payload.delta;

  return "";
}

// ── Server-Sent Events ──────────────────────────────────────────────────────

interface SseEvent {
  event: string;
  data: string;
}

function parseSseEvent(raw: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) continue; // blank / comment (keep-alive)
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
    else if (field === "event") event = value;
    // `id` and `retry` are irrelevant for a one-shot request.
  }
  return data.length ? { event, data: data.join("\n") } : null;
}

/** Text carried by one SSE event; `null` means the stream is finished. */
function sseEventText(event: SseEvent): string | null {
  if (event.event === "error") {
    let detail: unknown = event.data;
    try {
      const parsed: unknown = JSON.parse(event.data);
      detail = isObject(parsed) ? (parsed.error ?? parsed) : parsed;
    } catch {
      // Plain-text error message — use it as is.
    }
    throw new StreamError(errorMessage(detail));
  }
  if (event.data === "[DONE]") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.data);
  } catch {
    return event.data; // not JSON — plain-text SSE
  }
  // Bare JSON scalars (`123`, `true`) are really plain-text tokens. Kept outside
  // the try above so a StreamError from extractDelta is not swallowed.
  return isObject(parsed) || typeof parsed === "string" ? extractDelta(parsed) : event.data;
}

async function cancelQuietly(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    await reader.cancel();
  } catch {
    // The stream may already be closed or errored — nothing to clean up.
  }
}

/** Yield text deltas from an SSE response body. Ends on `[DONE]` or EOF. */
export async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // `stream: true` keeps multi-byte characters split across chunks intact.
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const event = parseSseEvent(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (event) {
          const text = sseEventText(event);
          if (text === null) return;
          if (text) yield text;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }

    // Servers sometimes omit the blank line after the final event.
    buffer += decoder.decode();
    const last = parseSseEvent(buffer.replace(/\r\n/g, "\n"));
    if (last) {
      const text = sseEventText(last);
      if (text) yield text;
    }
  } finally {
    await cancelQuietly(reader);
  }
}

/** Yield decoded chunks from a plain `text/plain` streaming body. */
export async function* readTextStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const rest = decoder.decode();
    if (rest) yield rest;
  } finally {
    await cancelQuietly(reader);
  }
}
