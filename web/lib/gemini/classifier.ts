// ---------------------------------------------------------------------------
// classifier.ts — Calls Gemini to classify a user question and extract
// structured financial parameters.  Uses responseSchema to guarantee the
// output is valid JSON that matches ClassificationResult.
// ---------------------------------------------------------------------------

import { Type, type Schema } from "@google/genai";
import { genai } from "./client";
import { INTENT_CLASSIFICATION_PROMPT } from "./prompts/intent-classification";
import type { ClassificationResult } from "../types/classification";

// ── Gemini response schema ──────────────────────────────────────────────────
// Mirrors ClassificationResult so the model is constrained to valid JSON.
// Filters are defined with explicit nullable keys so Gemini knows which
// filter fields are allowed; nulls are stripped after parsing.

const classificationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: [
        "information_retrieval",
        "analytical_interpretation",
        "recommendation",
        "unsupported",
      ],
    },
    question_type: {
      type: Type.STRING,
    },
    datasets: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    metric: {
      type: Type.STRING,
      nullable: true,
    },
    period: {
      type: Type.STRING,
      nullable: true,
    },
    comparison_period: {
      type: Type.STRING,
      nullable: true,
    },
    dimensions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    filters: {
      type: Type.OBJECT,
      properties: {
        department: { type: Type.STRING, nullable: true },
        business_unit: { type: Type.STRING, nullable: true },
        customer: { type: Type.STRING, nullable: true },
        product_category: { type: Type.STRING, nullable: true },
        payment_status: { type: Type.STRING, nullable: true },
        salesperson: { type: Type.STRING, nullable: true },
      },
    },
    metric_conditions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          metric: { type: Type.STRING },
          operator: {
            type: Type.STRING,
            enum: [">", ">=", "<", "<=", "=", "!="],
          },
          value: { type: Type.NUMBER },
        },
        required: ["metric", "operator", "value"],
      },
    },
    top_n: {
      type: Type.INTEGER,
      nullable: true,
    },
    is_supported: {
      type: Type.BOOLEAN,
    },
    is_ambiguous: {
      type: Type.BOOLEAN,
    },
    confidence: {
      type: Type.NUMBER,
    },
    reason: {
      type: Type.STRING,
    },
  },
  required: [
    "intent",
    "question_type",
    "datasets",
    "metric",
    "period",
    "comparison_period",
    "dimensions",
    "filters",
    "metric_conditions",
    "top_n",
    "is_supported",
    "is_ambiguous",
    "confidence",
    "reason",
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Remove null / undefined entries so filters is a clean { key: value } map. */
function cleanFilters(
  raw: Record<string, string | null | undefined>
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== null && value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// ── Public API ──────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-3.5-flash-lite";

/**
 * Send a user message to Gemini and receive a structured classification.
 *
 * @param userMessage  The raw question typed by the user.
 * @returns            A validated ClassificationResult JSON object.
 */
export async function classifyIntent(
  userMessage: string
): Promise<ClassificationResult> {
  const response = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userMessage,
    config: {
      systemInstruction: INTENT_CLASSIFICATION_PROMPT,
      responseMimeType: "application/json",
      responseSchema: classificationSchema,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  const parsed = JSON.parse(text) as ClassificationResult;

  // Clean up null entries in filters produced by the schema
  parsed.filters = cleanFilters(
    parsed.filters as Record<string, string | null>
  );

  return parsed;
}
