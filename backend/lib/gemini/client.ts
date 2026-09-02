// ---------------------------------------------------------------------------
// client.ts — Singleton Gemini client, initialised from the GEMINI_API_KEY
// environment variable that Next.js loads from .env.local.
// ---------------------------------------------------------------------------

import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY is not set. " +
      "Add it to backend/.env.local  →  GEMINI_API_KEY=your_key_here"
  );
}

export const genai = new GoogleGenAI({ apiKey });
