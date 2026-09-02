// ---------------------------------------------------------------------------
// validate-classification.ts — Validates every field of a ClassificationResult
// against the allowlists.  Returns { valid, errors } so the API route can
// decide whether to trust the classification or reject it.
// ---------------------------------------------------------------------------

import type {
  ClassificationResult,
  ValidationResult,
} from "../types/classification";

import {
  VALID_INTENTS,
  VALID_QUESTION_TYPES,
  VALID_METRICS,
  VALID_DIMENSIONS,
  VALID_DATASETS,
  VALID_FILTER_KEYS,
  QUESTION_TYPES_BY_INTENT,
} from "./allowlists";

/**
 * Validate a Gemini classification result against the known allowlists.
 *
 * @param result  The parsed JSON returned by `classifyIntent()`.
 * @returns       `{ valid: true, errors: [] }` when everything checks out,
 *                or `{ valid: false, errors: [...] }` listing every problem.
 */
export function validateClassification(
  result: ClassificationResult
): ValidationResult {
  const errors: string[] = [];

  // ── intent ────────────────────────────────────────────────────────────────
  if (!VALID_INTENTS.has(result.intent)) {
    errors.push(`Invalid intent: "${result.intent}"`);
  }

  // ── question_type ─────────────────────────────────────────────────────────
  if (!VALID_QUESTION_TYPES.has(result.question_type)) {
    errors.push(`Invalid question_type: "${result.question_type}"`);
  }

  // ── question_type must be valid for the given intent ──────────────────────
  if (VALID_INTENTS.has(result.intent)) {
    const allowed = QUESTION_TYPES_BY_INTENT[result.intent];
    if (allowed && !allowed.has(result.question_type)) {
      errors.push(
        `Question type "${result.question_type}" is not valid for intent "${result.intent}". ` +
          `Allowed: ${[...allowed].join(", ")}`
      );
    }
  }

  // ── datasets ──────────────────────────────────────────────────────────────
  if (!Array.isArray(result.datasets)) {
    errors.push("datasets must be an array");
  } else {
    for (const ds of result.datasets) {
      if (!VALID_DATASETS.has(ds)) {
        errors.push(`Invalid dataset: "${ds}"`);
      }
    }
  }

  // ── metric ────────────────────────────────────────────────────────────────
  if (result.metric !== null && !VALID_METRICS.has(result.metric)) {
    errors.push(`Invalid metric: "${result.metric}"`);
  }

  // ── dimensions ────────────────────────────────────────────────────────────
  if (!Array.isArray(result.dimensions)) {
    errors.push("dimensions must be an array");
  } else {
    for (const dim of result.dimensions) {
      if (!VALID_DIMENSIONS.has(dim)) {
        errors.push(`Invalid dimension: "${dim}"`);
      }
    }
  }

  // ── filters ───────────────────────────────────────────────────────────────
  if (result.filters && typeof result.filters === "object") {
    for (const key of Object.keys(result.filters)) {
      if (!VALID_FILTER_KEYS.has(key)) {
        errors.push(`Invalid filter key: "${key}"`);
      }
    }
  }

  // ── top_n ─────────────────────────────────────────────────────────────────
  if (
    result.top_n !== null &&
    (typeof result.top_n !== "number" ||
      !Number.isInteger(result.top_n) ||
      result.top_n < 1)
  ) {
    errors.push(
      `top_n must be a positive integer or null, got: ${result.top_n}`
    );
  }

  // ── confidence ────────────────────────────────────────────────────────────
  if (
    typeof result.confidence !== "number" ||
    result.confidence < 0 ||
    result.confidence > 1
  ) {
    errors.push(
      `confidence must be a number between 0 and 1, got: ${result.confidence}`
    );
  }

  // ── reason ────────────────────────────────────────────────────────────────
  if (typeof result.reason !== "string" || result.reason.trim().length === 0) {
    errors.push("reason must be a non-empty string");
  }

  return { valid: errors.length === 0, errors };
}
