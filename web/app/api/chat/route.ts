// ---------------------------------------------------------------------------
// POST /api/chat
//
// End-to-end financial chatbot pipeline:
// 1. Receives { message: string } from client.
// 2. Classifies intent and extracts parameters using Gemini.
// 3. Validates classification against schema allowlists.
// 4. Routes to the appropriate database retrieval engine based on intent.
// 5. Synthesises a natural-language response using Gemini with ground-truth data.
//    When the widget sends the page the user is on (`context`), the answer also
//    comes with a walkthrough of the charts and tables that show it, and the
//    `scope` (page and filters) to open first, as with /api/chat-sql.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { classifyIntent } from "@/lib/gemini/classifier";
import { validateClassification } from "@/lib/validators/validate-classification";
import { retrieveData } from "@/lib/data-retrieval";
import { generateResponse } from "@/lib/gemini/response-generator";
import { answerClassicWithWalkthrough } from "@/lib/gemini/walkthrough";
import { parseChatContext } from "@/lib/text-to-sql/context";
import type { RetrievalResult } from "@/lib/data-retrieval/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;
    const context = parseChatContext(body?.context);

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

    // ── 5. Route every supported question_type to its retrieval service ───
    const data: RetrievalResult = await retrieveData(classification);

    // From the chat widget: answer with a walkthrough of the page that shows it.
    if (context) {
      const { reply, walkthrough, scope } = await answerClassicWithWalkthrough(query, classification, data, context);
      if (reply) {
        return NextResponse.json({
          reply,
          ...(walkthrough ? { walkthrough } : {}),
          ...(walkthrough && scope ? { scope } : {}),
          data,
          classification,
          validation,
        });
      }
    }

    const reply = await generateResponse(query, classification, data);

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
