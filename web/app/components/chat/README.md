# Chat widget

A floating circle at the bottom-right of the signed-in app. Click it and a chat
panel opens above it. Mounted once in `app/layout.tsx`; it only renders on the
app routes listed in `chat-widget.tsx` (`APP_ROUTES` — keep in sync with
`PROTECTED_PREFIXES` in `lib/supabase/proxy.ts`), and unmounting on sign-out
clears the conversation.

| File | Role |
| --- | --- |
| `chat-widget.tsx` | UI: circle, panel, messages, composer (Enter sends, Shift+Enter newline, Esc closes, Stop button while streaming) |
| `use-chat.ts` / `chat-state.ts` | Conversation state (a pure reducer) + the hook that drives a reply |
| `chat-transport.ts` | `POST /api/chat` and turns the response into a stream of text deltas |
| `stream-parser.ts` | Parses SSE / plain-text streams into deltas (Gemini shapes) |
| `markdown.ts` / `markdown-view.tsx` | Tiny Markdown renderer (tables, bullets, bold…); no HTML injection, no dependency |

Unit tests sit next to each file (`*.test.ts`); run `npm test`.

## How it talks to the backend

The widget sends `POST /api/chat` with `{ "message": string }` and picks a
reader from the **response `Content-Type`**, so no UI change is needed when the
backend starts streaming:

| Response | Behaviour |
| --- | --- |
| `application/json` — `{ reply }` (**what the route returns today**) | Whole reply is already here, so the widget reveals it progressively on the client (≤ ~1.2 s) to keep the streaming feel |
| `text/event-stream` | **True streaming** — see below |
| `text/plain` | True streaming of raw text chunks |
| non-2xx JSON (`{ error, details }`) | Friendly message + "Try again". `details` is never shown, only `console.warn`ed |

## Demo mode (fake answers)

Set `NEXT_PUBLIC_CHAT_MOCK="true"` in `web/.env` and **restart `npm run dev`**
(`NEXT_PUBLIC_*` values are inlined when the server starts / at build time).
The widget then never calls `/api/chat`: it waits ~0.7 s, then streams a canned
answer chosen by keyword (`mock-replies.ts`: receivables, profit, sales/customers,
greeting, or the "I can only answer…" decline). A "Demo mode — sample answers,
not real data" banner is shown and every numeric answer ends with a sample-data
note, so invented figures can't pass for real ones.

Type `/error` in demo mode to see the error state and "Try again".

Off by default. On Vercel / in Docker the value is fixed per build, so don't
leave it `true` on a deployment people rely on.

## Streaming contract (for the backend)

Not implemented server-side yet. The widget is written against Gemini's own
streaming format ([docs](https://ai.google.dev/api/generate-content),
`streamGenerateContent` with `alt=sse`), so piping Gemini's stream through works
as-is. Send `Content-Type: text/event-stream` and one SSE event per chunk. Any
of these payload shapes is understood:

```text
data: {"candidates":[{"content":{"parts":[{"text":"Revenue "}]}}]}   ← Gemini chunk (SDK / REST)
data: {"event_type":"step.delta","delta":{"type":"text","text":"Revenue "}}   ← Gemini Interactions API
data: {"text":"Revenue "}                                             ← simple wrapper
data: [DONE]                                                          ← optional end marker (closing the stream also ends it)
```

- Each event's text is **only the new delta**, never the text so far. That is
  how Gemini streams (`chunk.text` from `generateContentStream`).
- Metadata-only chunks (`finishReason`, `usageMetadata`) are ignored.
- Report a failure inside the stream with `data: {"error":{"message":"…"}}` (or
  `event: error`). Partial text already shown is kept and "Try again" appears.
- Keep early exits (validation 422, unsupported / ambiguous replies) as JSON:
  the widget handles JSON and streams per response.
- The pipeline is classify → validate → retrieve → generate, so the first token
  can take a few seconds; the widget shows typing dots until it arrives.

Sketch of the change, using the SDK already installed (`@google/genai`):

```ts
// lib/gemini/response-generator.ts — generateContentStream instead of generateContent
export async function* generateResponseStream(/* same args as generateResponse */) {
  const stream = await genai.models.generateContentStream({ model, contents, config });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text; // delta for this chunk
  }
}

// app/api/chat/route.ts — in the information_retrieval branch
const encoder = new TextEncoder();
const body = new ReadableStream({
  async start(controller) {
    const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    try {
      for await (const text of generateResponseStream(query, classification, data)) send({ text });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    } catch {
      send({ error: { message: "The assistant ran into a problem." } });
    } finally {
      controller.close();
    }
  },
});
return new Response(body, {
  headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
});
```

(Returning a `ReadableStream` from a route handler is the documented Next.js
pattern — see `route.md` → Streaming in the Next docs.)

## Good to know

- **Stop** aborts the browser's request and keeps the partial text. Whether the
  server also stops calling Gemini depends on the backend noticing the
  disconnect — worth testing once streaming exists.
- `/api/chat` does **not** check authentication (the proxy skips `/api/*`), so
  anyone who can reach the site can call it and use Gemini quota. The widget is
  hidden on public pages, but that is UI only.
- Only `{ message }` is sent — no conversation history — because that is all
  the route reads. Follow-ups are answered independently.
- Requests time out after 60 s with a friendly message.
