// ---------------------------------------------------------------------------
// POST /api/chat
//
// End-to-end financial chatbot pipeline:
// 1. Receives { message: string } from client.
// 2. Classifies intent and extracts parameters using Gemini.
// 3. Validates classification against schema allowlists.
// 4. Routes to the appropriate database retrieval engine based on intent.
// 5. Synthesises a natural-language response using Gemini with ground-truth data.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { classifyIntent } from "@/lib/gemini/classifier";
import { validateClassification } from "@/lib/validators/validate-classification";
import { retrieveData } from "@/lib/data-retrieval";
import { generateResponse } from "@/lib/gemini/response-generator";
import type { RetrievalResult } from "@/lib/data-retrieval/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    // ── 1. Input validation ───────────────────────────────────────────────
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty 'message' field in request body" },
        { status: 400 }
      );
    }

    const query = message.trim();

    // ── 2. Classify intent via Gemini ─────────────────────────────────────
    const classification = await classifyIntent(query);

    // ── 3. Validate classification against allowlists ─────────────────────
    const validation = validateClassification(classification);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "Classification validation failed",
          details: validation.errors,
          classification,
          validation,
        },
        { status: 422 }
      );
    }

    // ── 4. Handle unsupported or ambiguous requests ───────────────────────
    if (!classification.is_supported) {
      return NextResponse.json({
        reply:
          classification.reason ||
          "I can only answer questions related to Profit & Loss, Sales, and Accounts Receivable.",
        data: null,
        classification,
        validation,
      });
    }

    if (classification.is_ambiguous) {
      return NextResponse.json({
        reply: `Could you clarify your request? ${classification.reason}`,
        data: null,
        classification,
        validation,
      });
    }

    // ── 5. Intent routing & Data retrieval ────────────────────────────────
    let data: RetrievalResult | null = null;
    let reply: string;

    switch (classification.intent) {
      case "information_retrieval": {
        // Execute database query engine
        data = await retrieveData(classification);

        // Synthesise natural-language answer with ground-truth data
        reply = await generateResponse(query, classification, data);
        break;
      }

      case "analytical_interpretation": {
        // Analytical variance & driver drill-down (planned for subsequent phase)
        reply = `I have classified this as an **Analytical Interpretation** (${classification.question_type}). Root-cause drill-down analysis is currently in progress.`;
        break;
      }

      case "recommendation": {
        // Actionable decision support (planned for subsequent phase)
        reply = `I have classified this as a **Recommendation** (${classification.question_type}). Decision support workflows are currently in progress.`;
        break;
      }

      default: {
        reply =
          classification.reason ||
          "I am unable to process this request with the currently available models.";
        break;
      }
    }

    return NextResponse.json({
      reply,
      data,
      classification,
      validation,
    });
  } catch (error: unknown) {
    console.error("Chat pipeline error:", error);

    const details = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: "Chat request processing failed", details },
      { status: 500 }
    );
  }
}
