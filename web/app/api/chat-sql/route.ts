// ---------------------------------------------------------------------------
// POST /api/chat-sql
//
// The chatbot backend that lets the model write read-only SQL (lib/text-to-sql),
// as an alternative to /api/chat. Same request and reply shape, plus:
//   request  `context`      the page the user has open (and its period/filters)
//   response `walkthrough`  which charts and tables to highlight while explaining
//
// Unlike /api/chat this requires a signed-in user: it can read the whole ledger.
// To try it, set NEXT_PUBLIC_CHAT_ENDPOINT=/api/chat-sql in web/.env.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseChatContext } from "@/lib/text-to-sql/context";
import { answerChatQuestion } from "@/lib/text-to-sql/service";

// Two model calls plus a query can take a while on a slow reply.
export const maxDuration = 60;

const MAX_MESSAGE_LENGTH = 1000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const { message, context } = (typeof body === "object" && body !== null ? body : {}) as { message?: unknown; context?: unknown };
  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "Missing or empty 'message' field in request body" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `'message' is longer than ${MAX_MESSAGE_LENGTH} characters` }, { status: 400 });
  }

  const { status, body: reply } = await answerChatQuestion(message.trim(), parseChatContext(context));
  return NextResponse.json(reply, { status });
}
