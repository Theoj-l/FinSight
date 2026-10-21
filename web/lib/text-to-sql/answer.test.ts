import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();
vi.mock("../gemini/client", () => ({ genai: { models: { generateContent: (...args: unknown[]) => generateContent(...args) } } }));

const { writeAnswer, writeAnswerWithWalkthrough } = await import("./answer");

const context = { page: "dashboard" as const, periodStart: "202606", periodEnd: "202606", units: [], branches: [] };
const executed = [{ purpose: "net profit", sql: "select 1", rows: [{ net_profit: "946629.66" }], rowCount: 1, truncated: false, ms: 5 }];
const reply = (body: unknown) => ({
  text: typeof body === "string" ? body : JSON.stringify(body),
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 },
});

beforeEach(() => generateContent.mockReset());

describe("writeAnswerWithWalkthrough", () => {
  it("returns the answer and a checked walkthrough", async () => {
    generateContent.mockResolvedValueOnce(
      reply({
        reply: "Net profit was 946,629.66.",
        walkthrough: { opening: "Here it is.", steps: [{ label: "kpi-cards", explanation: "The Net profit card shows it." }] },
      }),
    );

    const result = await writeAnswerWithWalkthrough("net profit?", executed, context);

    expect(result.reply).toBe("Net profit was 946,629.66.");
    expect(result.walkthrough).toEqual({ opening: "Here it is.", steps: [{ label: "kpi-cards", explanation: "The Net profit card shows it." }] });
    expect(result.tokens).toEqual({ input: 10, output: 4 });
  });

  it("asks for JSON limited to the six panel ids, with the dashboard in the system prompt", async () => {
    generateContent.mockResolvedValueOnce(reply({ reply: "ok", walkthrough: null }));
    await writeAnswerWithWalkthrough("q", executed, context);

    const { config, contents } = generateContent.mock.calls[0][0];
    expect(config.responseMimeType).toBe("application/json");
    expect(config.responseSchema.properties.walkthrough.properties.steps.items.properties.label.enum).toHaveLength(6);
    expect(config.systemInstruction).toContain("showing period 2026-06");
    expect(contents).toContain("946629.66");
  });

  it("drops invalid steps, and returns null when none are left, without losing the answer", async () => {
    generateContent.mockResolvedValueOnce(
      reply({ reply: "ok", walkthrough: { opening: "x", steps: [{ label: "made-up", explanation: "y" }, { label: "filters", explanation: "  " }] } }),
    );
    expect(await writeAnswerWithWalkthrough("q", executed, context)).toMatchObject({ reply: "ok", walkthrough: null });
  });

  it("keeps the text as the answer if the model does not return JSON", async () => {
    generateContent.mockResolvedValueOnce(reply("Plain text answer."));
    expect(await writeAnswerWithWalkthrough("q", executed, context)).toMatchObject({ reply: "Plain text answer.", walkthrough: null });
  });

  it("fails when there is no answer text at all", async () => {
    generateContent.mockResolvedValueOnce(reply({ reply: "   ", walkthrough: null }));
    await expect(writeAnswerWithWalkthrough("q", executed, context)).rejects.toThrow(/no answer text/);
    generateContent.mockResolvedValueOnce({ text: "" });
    await expect(writeAnswerWithWalkthrough("q", executed, context)).rejects.toThrow(/empty response/);
  });
});

describe("writeAnswer (plain)", () => {
  it("is unchanged: plain text with the shared answer prompt, no JSON mode", async () => {
    generateContent.mockResolvedValueOnce(reply("  Net profit was 946,629.66.  "));
    const result = await writeAnswer("q", executed);

    expect(result.reply).toBe("Net profit was 946,629.66.");
    expect(generateContent.mock.calls[0][0].config.responseMimeType).toBeUndefined();
  });
});
