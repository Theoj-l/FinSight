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

## Pointing at charts and tables (walkthrough)

An answer can be explained *using* the charts and tables of the app: each one is
highlighted while its explanation is shown, as a step-by-step card. It works on three
pages, each with its own numbered badges (ids and numbers in `../tour/tour-labels.ts`):

| Page | Parts | Badges |
| --- | --- | --- |
| Dashboard (`/dashboard`) | filters, compare-against, KPI cards, anomalies, 8 charts and tables | 1–12 |
| Forecast (`/forecast`) | filters, metric switch, summary cards, chart, horizon table | 1–5 |
| Home (`/home`) | financial snapshot, needs your attention | 1–2 |

**The app opens the right page.** A walkthrough belongs to one page. If the answer is
shown best on another one (a forecast question asked on the home page, a profit question
asked on Reports), the reply names that page and the widget opens it before the
highlighting starts. While it runs the chat minimizes and the step card floats beside the
chat button, so it never covers the part being pointed at; reopening the chat shows the
card inside the conversation again.

**Request** — the widget adds `context` (read from the page address, see
`chat-context.ts`). `page` is `dashboard`, `forecast`, `home`, or `other` for pages with
nothing to point at:

```json
{ "message": "…", "context": { "page": "dashboard", "periodStart": "202608",
  "periodEnd": "202608", "units": [], "branches": [] } }
```

**Response** — the JSON reply may carry an optional `walkthrough` and the `scope` it is
written for (the page, and its period and filters where it has them):

```json
{ "reply": "…",
  "walkthrough": { "opening": "…", "steps": [ { "label": "profit-margin", "explanation": "…" } ] },
  "scope": { "page": "dashboard", "periodStart": "202608", "periodEnd": "202608", "units": [], "branches": [] } }
```

Before the highlighting starts the widget opens `scope` (`router.push` to
`/dashboard?periodStart=…&unit=…`, `/forecast?unit=…` or `/home`), waits until the address
has changed (Next only changes it once the new page is ready) and until the labelled
parts exist, and then begins. The backend only returns a `scope` that exists in the data,
and only together with a walkthrough, so nothing changes without an explanation. If the
page cannot be opened within 10 seconds the answer is still shown, just without the
highlighting.

It is validated (`parseTourScript`): unknown labels, labels from another page, empty text
and duplicates are dropped, and a walkthrough with nothing left is ignored, so a bad reply
can't break a page. It starts once the answer text has finished. Only JSON replies carry it
so far (not SSE / plain-text streams). The wording the AI should follow is in
`docs/ai-context/finsight-data-guide.md`, section 7.

Demo mode produces walkthroughs too: try "Walk me through this dashboard" or the
net-profit question. In demo mode the first visit to the dashboard asks for the
walkthrough by itself (`WALKTHROUGH_ON_FIRST_VISIT` in `chat-widget.tsx`).

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
