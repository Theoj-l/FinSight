import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sameScope } from "@/lib/text-to-sql/context";
import type { TourScript } from "../tour/tour-script";
import { chatReducer, initialChatState } from "./chat-state";
import { readChatContext, scopeToUrl } from "./chat-context";
import { streamChatReply } from "./chat-transport";

const scope = { page: "dashboard" as const, periodStart: "202605", periodEnd: "202605", units: ["TP"], branches: [] as string[] };
const walkthrough: TourScript = { opening: "Look.", steps: [{ label: "filters", explanation: "Here." }] };

describe("scopeToUrl", () => {
  it("builds the dashboard address the filters read", () => {
    expect(scopeToUrl(scope)).toBe("/dashboard?periodStart=202605&periodEnd=202605&unit=TP");
  });

  it("repeats unit and branch for several, and leaves them out when empty", () => {
    expect(scopeToUrl({ ...scope, periodEnd: "202607", units: ["CP", "TP"], branches: ["KL"] })).toBe(
      "/dashboard?periodStart=202605&periodEnd=202607&unit=CP&unit=TP&branch=KL",
    );
    expect(scopeToUrl({ ...scope, units: [] })).toBe("/dashboard?periodStart=202605&periodEnd=202605");
  });

  it("round-trips: the address it builds is read back as the same scope", () => {
    const url = new URL(scopeToUrl({ ...scope, units: ["CP", "TP"] }), "http://localhost");
    expect(sameScope(readChatContext(url.pathname, url.search), { ...scope, units: ["CP", "TP"] })).toBe(true);
  });
});

describe("chatReducer — scope", () => {
  it("keeps the scope on the message with its walkthrough", () => {
    const sent = chatReducer(initialChatState, { type: "send", text: "q", userId: "u", assistantId: "a" });
    const next = chatReducer(sent, { type: "walkthrough", id: "a", script: walkthrough, scope });
    expect(next.messages[1]).toMatchObject({ walkthrough, scope });
  });

  it("works without a scope", () => {
    const sent = chatReducer(initialChatState, { type: "send", text: "q", userId: "u", assistantId: "a" });
    expect(chatReducer(sent, { type: "walkthrough", id: "a", script: walkthrough }).messages[1].scope).toBeUndefined();
  });
});

describe("streamChatReply — scope", () => {
  const fetchMock = vi.fn();
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const run = async (body: unknown) => {
    fetchMock.mockResolvedValueOnce(json(body));
    const seen: unknown[] = [];
    for await (const chunk of streamChatReply("q", { simulate: false, onWalkthrough: (script, s) => seen.push([script, s]) })) void chunk;
    return seen;
  };

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("hands over the scope with the walkthrough", async () => {
    expect(await run({ reply: "ok", walkthrough, scope })).toEqual([[walkthrough, scope]]);
  });

  it("cleans the scope: unsafe values are dropped", async () => {
    const [[, received]] = (await run({ reply: "ok", walkthrough, scope: { ...scope, units: ["TP", "bad value!"] } })) as [[unknown, typeof scope]];
    expect(received.units).toEqual(["TP"]);
  });

  it("passes null when there is no usable scope", async () => {
    expect(await run({ reply: "ok", walkthrough })).toEqual([[walkthrough, null]]);
    expect(await run({ reply: "ok", walkthrough, scope: { page: "home" } })).toEqual([[walkthrough, null]]);
  });
});
