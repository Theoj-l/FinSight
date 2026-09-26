import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatRequestError, EMPTY_REPLY_MESSAGE, describeChatError, simulateStream, streamChatReply } from "./chat-transport";
import { mockReplyFor } from "./mock-replies";

const encoder = new TextEncoder();

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(generator: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const item of generator) out.push(item);
  return out;
}

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("streamChatReply — request", () => {
  it("POSTs the message as JSON and advertises streaming support", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reply: "ok" }));

    await collect(streamChatReply("How is revenue?", { simulate: false }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/chat");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ message: "How is revenue?" }));
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(init.headers.Accept).toContain("text/event-stream");
  });
});

describe("streamChatReply — responses", () => {
  it("yields the whole JSON reply at once when simulation is off", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reply: "Revenue was **$1M**.", data: null }));
    expect(await collect(streamChatReply("q", { simulate: false }))).toEqual(["Revenue was **$1M**."]);
  });

  it("reveals a JSON reply progressively by default, losing nothing", async () => {
    const reply = "Revenue rose 8% this month, driven by two customers.";
    fetchMock.mockResolvedValueOnce(jsonResponse({ reply }));

    const chunks = await collect(streamChatReply("q"));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(reply);
  });

  it("streams Gemini-shaped Server-Sent Events", async () => {
    const event = (text: string) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;
    fetchMock.mockResolvedValueOnce(
      new Response(streamOf(event("Rev"), event("enue"), "data: [DONE]\n\n"), {
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      }),
    );

    expect(await collect(streamChatReply("q"))).toEqual(["Rev", "enue"]);
  });

  it("streams a plain text body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(streamOf("Hello ", "world"), { headers: { "content-type": "text/plain; charset=utf-8" } }),
    );

    expect((await collect(streamChatReply("q"))).join("")).toBe("Hello world");
  });

  it("turns an error inside the stream into a displayable ChatRequestError", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(streamOf('data: {"error":{"message":"quota reached"}}\n\n'), {
        headers: { "content-type": "text/event-stream" },
      }),
    );

    await expect(collect(streamChatReply("q"))).rejects.toMatchObject({
      name: "ChatRequestError",
      message: "quota reached",
    });
  });

  it("rejects an empty JSON reply", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reply: "   " }));
    await expect(collect(streamChatReply("q"))).rejects.toThrow(EMPTY_REPLY_MESSAGE);

    fetchMock.mockResolvedValueOnce(jsonResponse({ nope: true }));
    await expect(collect(streamChatReply("q"))).rejects.toThrow(EMPTY_REPLY_MESSAGE);
  });
});

describe("streamChatReply — failures", () => {
  it("maps HTTP errors to friendly messages and never shows server details", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Chat request processing failed", details: "prisma: secret internals" }, { status: 500 }),
    );

    const error = await collect(streamChatReply("q")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChatRequestError);
    expect((error as ChatRequestError).status).toBe(500);
    expect((error as ChatRequestError).message).not.toContain("secret");
  });

  it("explains a 422 (unrecognised question) and a 429 (busy)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Classification validation failed" }, { status: 422 }));
    await expect(collect(streamChatReply("q"))).rejects.toThrow(/rephras/i);

    fetchMock.mockResolvedValueOnce(jsonResponse({}, { status: 429 }));
    await expect(collect(streamChatReply("q"))).rejects.toThrow(/busy/i);
  });

  it("copes with a non-JSON error body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(collect(streamChatReply("q"))).rejects.toBeInstanceOf(ChatRequestError);
  });

  it("reports a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(collect(streamChatReply("q"))).rejects.toThrow(/can't reach/i);
  });

  it("passes a caller abort through untouched", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const controller = new AbortController();

    const pending = collect(streamChatReply("q", { signal: controller.signal }));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("times out with a friendly message", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );

    await expect(collect(streamChatReply("q", { timeoutMs: 5 }))).rejects.toThrow(/too long/i);
  });
});

describe("simulateStream", () => {
  const instant = async () => {};

  it("reproduces the text exactly, whitespace included", async () => {
    const text = "  Line one\n\n| a | b |\nlast  ";
    expect((await collect(simulateStream(text, { sleep: instant }))).join("")).toBe(text);
  });

  it("emits at most 60 chunks however long the reply is", async () => {
    const long = Array.from({ length: 600 }, (_, i) => `w${i}`).join(" ");
    const chunks = await collect(simulateStream(long, { sleep: instant }));
    expect(chunks.length).toBeLessThanOrEqual(60);
    expect(chunks.join("")).toBe(long);
  });

  it("yields nothing for empty text", async () => {
    expect(await collect(simulateStream("", { sleep: instant }))).toEqual([]);
  });

  it("stops when aborted between chunks", async () => {
    const controller = new AbortController();
    const generator = simulateStream("a b c", {
      signal: controller.signal,
      sleep: async () => controller.abort(),
    });

    expect((await generator.next()).value).toBe("a ");
    await expect(generator.next()).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("streamChatReply — demo mode", () => {
  it("answers with the canned reply and never calls the API", async () => {
    const question = "What are our outstanding receivables?";

    const chunks = await collect(streamChatReply(question, { mock: true, mockLatencyMs: 0 }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(chunks.length).toBeGreaterThan(1); // streamed, not delivered in one piece
    expect(chunks.join("")).toBe(mockReplyFor(question));
  });

  it("can simulate a failure with the error command", async () => {
    await expect(collect(streamChatReply("/error", { mock: true, mockLatencyMs: 0 }))).rejects.toMatchObject({
      name: "ChatRequestError",
      message: expect.stringMatching(/simulated error/i),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("can be cancelled while waiting for the first token", async () => {
    const controller = new AbortController();

    const pending = collect(streamChatReply("hello", { mock: true, mockLatencyMs: 5_000, signal: controller.signal }));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("is off by default (no NEXT_PUBLIC_CHAT_MOCK), so the real API is used", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reply: "real" }));

    await collect(streamChatReply("hello", { simulate: false }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("describeChatError", () => {
  it("shows ChatRequestError messages and hides everything else", () => {
    expect(describeChatError(new ChatRequestError("Custom"))).toBe("Custom");
    expect(describeChatError(new Error("internal detail"))).not.toContain("internal");
  });
});
