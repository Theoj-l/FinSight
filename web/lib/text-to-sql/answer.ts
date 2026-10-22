// ---------------------------------------------------------------------------
// answer.ts — Call 2: turn the fetched rows into a written answer.
//
// Two writers share the same request layout:
//   writeAnswer                  plain text, using the SAME system prompt as the
//                                existing pipeline's generateResponse, so any
//                                difference in answers comes from how the data was
//                                fetched (Call 1). The evaluation uses this one.
//   writeAnswerWithWalkthrough   for a user with the dashboard open: returns the
//                                answer plus which charts and tables to highlight
//                                while it is explained (see walkthrough-prompt.ts).
// ---------------------------------------------------------------------------

import { Type, type Schema } from "@google/genai";
import type { TourPage } from "../../app/components/tour/tour-labels";
import { parseTourScript, type TourScript } from "../../app/components/tour/tour-script";
import { genai } from "../gemini/client";
import { RESPONSE_GENERATION_PROMPT } from "../gemini/prompts/response-generation";
import { GEMINI_MODEL } from "./config";
import type { ChatContext } from "./context";
import type { PlannedQuery } from "./generate-sql";
import type { QueryRows } from "./run-readonly";
import { buildWalkthroughSystemPrompt, walkthroughLabels } from "./walkthrough-prompt";

export interface ExecutedQuery extends PlannedQuery, Partial<QueryRows> {
  error?: string;
}

interface Usage {
  input: number;
  output: number;
}

function requestContents(question: string, executed: ExecutedQuery[]): string {
  const results = executed.map((query) => ({
    purpose: query.purpose,
    rows: query.rows ?? [],
    ...(query.truncated ? { note: "More rows matched than are shown; this is a partial list." } : {}),
  }));

  return `User Question:
"${question}"

How the data was retrieved:
${JSON.stringify(executed.map(({ purpose, sql }) => ({ purpose, sql })), null, 2)}

Ground-Truth Database Results:
${JSON.stringify(results, null, 2)}

Provide a direct, well-formatted response that addresses the user's question using the retrieved data above.`;
}

const usageOf = (response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }): Usage => ({
  input: response.usageMetadata?.promptTokenCount ?? 0,
  output: response.usageMetadata?.candidatesTokenCount ?? 0,
});

export async function writeAnswer(question: string, executed: ExecutedQuery[]): Promise<{ reply: string; tokens: Usage }> {
  const response = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents: requestContents(question, executed),
    config: { systemInstruction: RESPONSE_GENERATION_PROMPT },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response during answer generation");

  return { reply: text.trim(), tokens: usageOf(response) };
}

/** The reply schema for one page: the panel ids are limited to that page's. */
const walkthroughSchema = (page: TourPage): Schema => ({
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    walkthrough: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        opening: { type: Type.STRING },
        steps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING, enum: [...walkthroughLabels(page)] },
              explanation: { type: Type.STRING },
            },
            required: ["label", "explanation"],
          },
        },
      },
      required: ["opening", "steps"],
    },
  },
  required: ["reply", "walkthrough"],
});

/**
 * Write the answer and say which panels of one page to point at. The walkthrough is
 * checked before it leaves: unknown ids, empty text and repeats are dropped, and
 * it is null when nothing usable is left, so a bad reply can only cost the
 * highlighting, never the answer.
 */
export async function writeAnswerWithWalkthrough(
  question: string,
  executed: ExecutedQuery[],
  context: ChatContext & { page: TourPage },
  moved = false,
): Promise<{ reply: string; walkthrough: TourScript | null; tokens: Usage }> {
  const response = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents: requestContents(question, executed),
    config: {
      systemInstruction: buildWalkthroughSystemPrompt(context, moved),
      responseMimeType: "application/json",
      responseSchema: walkthroughSchema(context.page),
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response during answer generation");

  let parsed: { reply?: unknown; walkthrough?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    // Not JSON despite the schema: keep the text as the answer, without a walkthrough.
    return { reply: text.trim(), walkthrough: null, tokens: usageOf(response) };
  }

  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  if (!reply) throw new Error("Gemini returned no answer text");

  return { reply, walkthrough: parseTourScript(parsed.walkthrough, context.page), tokens: usageOf(response) };
}
