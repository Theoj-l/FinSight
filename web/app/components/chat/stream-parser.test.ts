import { describe, expect, it, vi } from "vitest";

import { StreamError, extractDelta, parseSseStream, readTextStream } from "./stream-parser";

const encoder = new TextEncoder();

function streamOf(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      controller.close();
    },
  });
}

async function collect(generator: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const item of generator) out.push(item);
  return out;
}

const geminiChunk = (text: string) => JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] });

describe("extractDelta", () => {
  it("reads the new text from a Gemini generateContent chunk", () => {
    const chunk = { candidates: [{ content: { role: "model", parts: [{ text: "Hel" }, { text: "lo" }] } }] };
    expect(extractDelta(chunk)).toBe("Hello");
  });

  it("skips thought summaries, like the SDK's .text getter", () => {
    const chunk = { candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: "Answer" }] } }] };
    expect(extractDelta(chunk)).toBe("Answer");
  });

  it("returns '' for the final metadata-only chunk", () => {
    const chunk = { candidates: [{ finishReason: "STOP" }], usageMetadata: { totalTokenCount: 12 } };
    expect(extractDelta(chunk)).toBe("");
  });

  it("reads Interactions API step.delta events", () => {
    expect(extractDelta({ event_type: "step.delta", delta: { type: "text", text: "Hi" } })).toBe("Hi");
    expect(extractDelta({ event_type: "step.delta", delta: { type: "thought", text: "hmm" } })).toBe("");
    expect(extractDelta({ event_type: "step.start" })).toBe("");
  });

  it("reads simple app-level payloads", () => {
    expect(extractDelta({ text: "a" })).toBe("a");
    expect(extractDelta({ delta: "b" })).toBe("b");
    expect(extractDelta("c")).toBe("c");
  });

  it("ignores payloads that are not objects or strings", () => {
    expect(extractDelta(null)).toBe("");
    expect(extractDelta(42)).toBe("");
    expect(extractDelta([])).toBe("");
  });

  it("throws StreamError for error payloads", () => {
    expect(() => extractDelta({ error: { message: "quota exceeded" } })).toThrow(StreamError);
    expect(() => extractDelta({ error: "boom" })).toThrow("boom");
  });

  it("throws StreamError when the prompt was blocked", () => {
    expect(() => extractDelta({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(StreamError);
  });
});

describe("parseSseStream", () => {
  it("yields Gemini deltas even when events are split across network chunks", async () => {
    const full = `data: ${geminiChunk("Hello ")}\n\ndata: {"text":"world"}\n\n`;
    const cut = 30; // lands in the middle of the first event
    const result = await collect(parseSseStream(streamOf(full.slice(0, cut), full.slice(cut))));
    expect(result).toEqual(["Hello ", "world"]);
  });

  it("handles CRLF line endings", async () => {
    const result = await collect(parseSseStream(streamOf('data: {"text":"a"}\r\n\r\ndata: {"text":"b"}\r\n\r\n')));
    expect(result).toEqual(["a", "b"]);
  });

  it("keeps multi-byte characters intact when bytes arrive one at a time", async () => {
    const bytes = encoder.encode('data: {"text":"café €"}\n\n');
    const oneByteChunks = Array.from(bytes, (byte) => Uint8Array.of(byte));
    expect(await collect(parseSseStream(streamOf(...oneByteChunks)))).toEqual(["café €"]);
  });

  it("stops at [DONE] and cancels the underlying stream", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"text":"a"}\n\ndata: [DONE]\n\ndata: {"text":"late"}\n\n'));
        // never closed — a real server would keep the connection open
      },
      cancel,
    });
    expect(await collect(parseSseStream(body))).toEqual(["a"]);
    expect(cancel).toHaveBeenCalled();
  });

  it("ignores comments and keep-alive lines", async () => {
    const result = await collect(parseSseStream(streamOf(': ping\n\ndata: {"text":"x"}\n\n')));
    expect(result).toEqual(["x"]);
  });

  it("falls back to plain text for non-JSON data, joining multi-line data", async () => {
    expect(await collect(parseSseStream(streamOf("data: hello\n\n")))).toEqual(["hello"]);
    expect(await collect(parseSseStream(streamOf("data: line1\ndata: line2\n\n")))).toEqual(["line1\nline2"]);
    expect(await collect(parseSseStream(streamOf("data: 42\n\n")))).toEqual(["42"]);
  });

  it("flushes a final event that has no trailing blank line", async () => {
    expect(await collect(parseSseStream(streamOf('data: {"text":"tail"}')))).toEqual(["tail"]);
  });

  it("skips events that carry no text, e.g. usage metadata", async () => {
    const usage = JSON.stringify({ candidates: [{ finishReason: "STOP" }], usageMetadata: {} });
    const result = await collect(parseSseStream(streamOf(`data: ${geminiChunk("hi")}\n\ndata: ${usage}\n\n`)));
    expect(result).toEqual(["hi"]);
  });

  it("rejects with StreamError on an error event", async () => {
    const body = streamOf('event: error\ndata: {"message":"nope"}\n\n');
    await expect(collect(parseSseStream(body))).rejects.toThrow("nope");
    await expect(collect(parseSseStream(streamOf("event: error\ndata: plain failure\n\n")))).rejects.toThrow(
      "plain failure",
    );
  });

  it("rejects with StreamError when a data event carries an error payload", async () => {
    const body = streamOf('data: {"error":{"message":"quota"}}\n\n');
    await expect(collect(parseSseStream(body))).rejects.toBeInstanceOf(StreamError);
  });
});

describe("readTextStream", () => {
  it("decodes multi-byte characters split across chunks", async () => {
    const bytes = encoder.encode("net € profit");
    const result = await collect(readTextStream(streamOf(bytes.slice(0, 5), bytes.slice(5))));
    expect(result.join("")).toBe("net € profit");
  });

  it("yields nothing for an empty body", async () => {
    expect(await collect(readTextStream(streamOf()))).toEqual([]);
  });
});
