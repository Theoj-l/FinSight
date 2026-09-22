// ---------------------------------------------------------------------------
// response-generator.ts — Generates natural-language answers using Gemini
// with the ground-truth data retrieved from the database.
// ---------------------------------------------------------------------------

import { genai } from "./client";
import { RESPONSE_GENERATION_PROMPT } from "./prompts/response-generation";
import type { ClassificationResult } from "../types/classification";
import type { RetrievalResult } from "../data-retrieval/types";

const GEMINI_MODEL = "gemini-3.5-flash-lite";

/**
 * Synthesise a user-facing answer from the user's question,
 * the classification result, and the retrieved database records.
 */
export async function generateResponse(
  userQuestion: string,
  classification: ClassificationResult,
  data: RetrievalResult
): Promise<string> {
  const contents = `User Question:
"${userQuestion}"

Classification Metadata:
${JSON.stringify(classification, null, 2)}

Ground-Truth Database Results:
${JSON.stringify(data, null, 2)}

Provide a direct, well-formatted response that addresses the user's question using the retrieved data above.`;

  const response = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: RESPONSE_GENERATION_PROMPT,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response during answer generation");
  }

  return text.trim();
}
