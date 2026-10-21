import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatContext } from "./chat-context";
import { chatReducer, initialChatState } from "./chat-state";
import { streamChatReply } from "./chat-transport";
import { MOCK_ERROR_COMMAND, mockWalkthroughFor } from "./mock-replies";
import { parseTourScript, type TourScript } from "../tour/tour-script";

const script: TourScript = {
  opening: "Here is where to look.",
  steps: [{ label: "profit-margin", explanation: "Net profit by month." }],
};

async function collect(generator: AsyncGenerator<string>) {
  const out: string[] = [];
  for await (const item of generator) out.push(item);
  return out;
}

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("chatReducer — walkthrough", () => {
  it("attaches the walkthrough to the assistant message only", () => {
    const sent = chatReducer(initialChatState, { type: "send", text: "q", userId: "u1", assistantId: "a1" });
    const next = chatReducer(sent, { type: "walkthrough", id: "a1", script });
    expect(next.messages[1].walkthrough).toEqual(script);
    expect(next.messages[0].walkthrough).toBeUndefined();
  });

  it("drops the walkthrough when an answer is retried", () => {
    let state = chatReducer(initialChatState, { type: "send", text: "q", userId: "u1", assistantId: "a1" });
    state = chatReducer(state, { type: "walkthrough", id: "a1", script });
    state = chatReducer(state, { type: "fail", id: "a1", error: "x" });
    state = chatReducer(state, { type: "retry", failedId: "a1", assistantId: "a2" });
    expect(state.messages[1].id).toBe("a2");
    expect(state.messages[1].walkthrough).toBeUndefined();
  });

  it("ignores a walkthrough for a message that no longer exists", () => {
    expect(chatReducer(initialChatState, { type: "walkthrough", id: "gone", script })).toBe(initialChatState);
  });
});

describe("streamChatReply — walkthrough", () => {
  it("sends the page context only when there is one", async () => {
    const context: ChatContext = { page: "dashboard", periodStart: "202608", periodEnd: "202608", units: [], branches: [] };

    fetchMock.mockResolvedValueOnce(jsonResponse({ reply: "ok" }));
    await collect(streamChatReply("q", { simulate: false, context }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ message: "q", context });

    fetchMock.mockResolvedValueOnce(jsonResponse({ reply: "ok" }));
    await collect(streamChatReply("q", { simulate: false, context: null }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ message: "q" });
  });

  it("hands over a valid walkthrough after the reply text", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reply: "Profit rose.", walkthrough: script }));
    const events: string[] = [];

    for await (const chunk of streamChatReply("q", {
      simulate: false,
      onWalkthrough: (received) => events.push(`walkthrough:${received.steps.length}`),
    })) {
      events.push(`text:${chunk}`);
    }

    expect(events).toEqual(["text:Profit rose.", "walkthrough:1"]);
  });

  it("cleans the walkthrough before handing it over", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        reply: "ok",
        walkthrough: {
          opening: "Hi",
          steps: [
            { label: "made-up", explanation: "x" },
            { label: "filters", explanation: "Pick a month." },
          ],
        },
      }),
    );
    const received: TourScript[] = [];

    await collect(streamChatReply("q", { simulate: false, onWalkthrough: (s) => received.push(s) }));

    expect(received).toHaveLength(1);
    expect(received[0].steps.map((step) => step.label)).toEqual(["filters"]);
  });

  it("ignores a missing or unusable walkthrough", async () => {
    const onWalkthrough = vi.fn();

    fetchMock.mockResolvedValueOnce(jsonResponse({ reply: "plain answer" }));
    await collect(streamChatReply("q", { simulate: false, onWalkthrough }));

    fetchMock.mockResolvedValueOnce(jsonResponse({ reply: "plain answer", walkthrough: { opening: "x", steps: [] } }));
    await collect(streamChatReply("q", { simulate: false, onWalkthrough }));

    expect(onWalkthrough).not.toHaveBeenCalled();
  });
});

describe("demo mode — walkthrough", () => {
  it("points at the dashboard for a walk-through request", () => {
    const labels = mockWalkthroughFor("Walk me through this dashboard")?.steps.map((step) => step.label);
    expect(labels).toEqual([
      "filters",
      "kpi-cards",
      "revenue-vs-expenses",
      "profit-margin",
      "revenue-by-group",
      "profit-loss",
    ]);
  });

  it("points at profit panels for a profit question, and nothing for receivables", () => {
    expect(mockWalkthroughFor("How did net profit change versus last month?")?.steps.map((s) => s.label)).toEqual([
      "kpi-cards",
      "profit-margin",
      "profit-loss",
    ]);
    expect(mockWalkthroughFor("What are our outstanding receivables?")).toBeNull();
    expect(mockWalkthroughFor("hello")).toBeNull();
  });

  it("has none for the simulated error", () => {
    expect(mockWalkthroughFor(MOCK_ERROR_COMMAND)).toBeNull();
  });

  it("only produces walkthroughs the app accepts", () => {
    for (const question of ["Walk me through this dashboard", "How did net profit change versus last month?"]) {
      const mock = mockWalkthroughFor(question);
      expect(parseTourScript(mock)).toEqual(mock);
    }
  });

  it("delivers the walkthrough through the transport, after the reply", async () => {
    const received: TourScript[] = [];
    const chunks = await collect(
      streamChatReply("Walk me through this dashboard", {
        mock: true,
        mockLatencyMs: 0,
        onWalkthrough: (s) => received.push(s),
      }),
    );
    expect(chunks.join("")).toContain("one part at a time");
    expect(received).toHaveLength(1);
    expect(received[0].steps).toHaveLength(6);
  });
});
