// ---------------------------------------------------------------------------
// tour-script.ts — the shape of a walkthrough, and how to trust one.
//
// A walkthrough is what the assistant attaches to an answer when charts or
// tables on the page help explain it: a short lead-in, then an ordered list of
// { label, explanation } steps. The UI highlights the part of the page named
// by `label` while it shows the explanation.
//
// It arrives as `walkthrough` next to `reply` in the chat response (and is
// produced by the mock replies in demo mode). Everything from the network goes
// through `parseTourScript` so a bad reply can never break the page.
// Pure: no React, no DOM.
// ---------------------------------------------------------------------------

import { isTourLabelId, type TourLabelId } from "./tour-labels";

export interface TourStep {
  label: TourLabelId;
  explanation: string;
}

export interface TourScript {
  opening: string;
  steps: TourStep[];
}

export type TourPage = "dashboard";

/** Which page (if any) has labelled parts the assistant can point at. */
export function tourPageFor(pathname: string): TourPage | null {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/") ? "dashboard" : null;
}

/**
 * Turn untrusted data (e.g. a model reply) into a walkthrough. Steps with an
 * unknown label or an empty explanation are dropped, and each label appears
 * once. Returns null when nothing usable is left.
 */
export function parseTourScript(raw: unknown): TourScript | null {
  if (!raw || typeof raw !== "object") return null;
  const { opening, steps } = raw as { opening?: unknown; steps?: unknown };
  if (typeof opening !== "string" || !opening.trim() || !Array.isArray(steps)) return null;

  const seen = new Set<TourLabelId>();
  const valid: TourStep[] = [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const { label, explanation } = step as { label?: unknown; explanation?: unknown };
    if (!isTourLabelId(label) || seen.has(label)) continue;
    if (typeof explanation !== "string" || !explanation.trim()) continue;
    seen.add(label);
    valid.push({ label, explanation: explanation.trim() });
  }

  return valid.length > 0 ? { opening: opening.trim(), steps: valid } : null;
}
