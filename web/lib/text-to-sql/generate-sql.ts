// ---------------------------------------------------------------------------
// generate-sql.ts — Call 1: the model turns a question into read-only SQL.
// ---------------------------------------------------------------------------

import { Type, type Schema } from "@google/genai";
import { genai } from "../gemini/client";
import { GEMINI_MODEL, MAX_QUERIES } from "./config";
import { describeContext, type ChatContext } from "./context";
import { buildSystemPrompt } from "./prompt";

export interface PlannedQuery {
  purpose: string;
  sql: string;
}

export interface SqlPlan {
  supported: boolean;
  /** A question to ask the user back, when theirs is too vague to answer. */
  needsClarification: string | null;
  reason: string;
  queries: PlannedQuery[];
  tokens: { input: number; output: number };
}

const planSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    supported: { type: Type.BOOLEAN },
    needs_clarification: { type: Type.STRING, nullable: true },
    reason: { type: Type.STRING },
    queries: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { purpose: { type: Type.STRING }, sql: { type: Type.STRING } },
        required: ["purpose", "sql"],
      },
    },
  },
  required: ["supported", "needs_clarification", "reason", "queries"],
};

export interface GenerateOptions {
  today: string;
  latestPeriod: number;
  /** Why the previous attempt failed, so the model can correct it. */
  feedback?: string;
  /** The dashboard the user has open, if any: used to resolve "this month" and similar. */
  context?: ChatContext | null;
}

export async function generateSql(question: string, { today, latestPeriod, feedback, context }: GenerateOptions): Promise<SqlPlan> {
  const parts = [question];
  if (context) parts.push(`Context (not part of the question): ${describeContext(context)}`);
  if (feedback) parts.push(feedback);
  const contents = parts.join("\n\n");

  const response = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: buildSystemPrompt({ today, latestPeriod }),
      responseMimeType: "application/json",
      responseSchema: planSchema,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty plan");

  const raw = JSON.parse(text) as {
    supported?: boolean;
    needs_clarification?: string | null;
    reason?: string;
    queries?: { purpose?: string; sql?: string }[];
  };

  const queries = (raw.queries ?? [])
    .filter((query): query is PlannedQuery => typeof query.sql === "string" && query.sql.trim() !== "")
    .map((query) => ({ purpose: query.purpose ?? "", sql: query.sql.trim() }))
    .slice(0, MAX_QUERIES);

  return {
    supported: raw.supported !== false,
    needsClarification: raw.needs_clarification?.trim() ? raw.needs_clarification.trim() : null,
    reason: raw.reason ?? "",
    queries,
    tokens: {
      input: response.usageMetadata?.promptTokenCount ?? 0,
      output: response.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
