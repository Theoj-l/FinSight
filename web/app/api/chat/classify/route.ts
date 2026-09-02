// ---------------------------------------------------------------------------
// POST /api/chat/classify
//
// Accepts { message: string } and returns the Gemini classification along
// with backend validation results.  This is an isolated endpoint so the
// classifier can be tested independently of the full chat pipeline.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { classifyIntent } from "@/lib/gemini/classifier";
import { validateClassification } from "@/lib/validators/validate-classification";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    // ── Input validation ──────────────────────────────────────────────────
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty 'message' field in request body" },
        { status: 400 }
      );
    }

    // ── Classify via Gemini ───────────────────────────────────────────────
    const classification = await classifyIntent(message.trim());

    // ── Validate against allowlists ───────────────────────────────────────
    const validation = validateClassification(classification);

    return NextResponse.json({
      classification,
      validation,
    });
  } catch (error: unknown) {
    console.error("Classification error:", error);

    const details =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: "Classification failed", details },
      { status: 500 }
    );
  }
}
