import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const answerChatQuestion = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/lib/text-to-sql/service", () => ({ answerChatQuestion: (...args: unknown[]) => answerChatQuestion(...args) }));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/chat-sql", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  getUser.mockReset();
  answerChatQuestion.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  answerChatQuestion.mockResolvedValue({ status: 200, body: { reply: "ok" } });
});

describe("POST /api/chat-sql", () => {
  it("requires a signed-in user, and does no work without one", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await post({ message: "hi" });

    expect(res.status).toBe(401);
    expect(answerChatQuestion).not.toHaveBeenCalled();
  });

  it("answers a question", async () => {
    const res = await post({ message: "  net profit?  " });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "ok" });
    expect(answerChatQuestion).toHaveBeenCalledWith("net profit?", null);
  });

  it("passes on a cleaned dashboard context and drops unsafe values", async () => {
    await post({ message: "q", context: { page: "dashboard", periodStart: "202606", units: ["CP", "bad value!"], branches: [] } });

    expect(answerChatQuestion).toHaveBeenCalledWith("q", {
      page: "dashboard",
      periodStart: "202606",
      periodEnd: "202606",
      units: ["CP"],
      branches: [],
    });
  });

  it("returns what the service returns, including a walkthrough and errors", async () => {
    const walkthrough = { opening: "Look.", steps: [{ label: "filters", explanation: "Here." }] };
    answerChatQuestion.mockResolvedValueOnce({ status: 200, body: { reply: "ok", walkthrough } });
    expect(await (await post({ message: "q" })).json()).toEqual({ reply: "ok", walkthrough });

    answerChatQuestion.mockResolvedValueOnce({ status: 502, body: { error: "Chat request processing failed" } });
    expect((await post({ message: "q" })).status).toBe(502);
  });

  it.each([
    ["no body", ""],
    ["not JSON", "{oops"],
    ["no message", {}],
    ["a non-string message", { message: 5 }],
    ["an empty message", { message: "   " }],
    ["a message that is too long", { message: "x".repeat(1001) }],
  ])("rejects %s with 400", async (_name, body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(answerChatQuestion).not.toHaveBeenCalled();
  });
});
