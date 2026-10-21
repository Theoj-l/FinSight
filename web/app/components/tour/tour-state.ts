// ---------------------------------------------------------------------------
// tour-state.ts — walkthrough state as a pure reducer (no React, no I/O).
//
// A walkthrough belongs to one assistant message: the message carries the
// script, and this state tracks which message is currently being stepped
// through and on which step.
// ---------------------------------------------------------------------------

import type { TourScript } from "./tour-script";

/** idle: nothing running · active: showing a step · done: finished all steps */
export type TourStatus = "idle" | "active" | "done";

export interface TourState {
  status: TourStatus;
  /** The chat message whose walkthrough is running. */
  messageId: string | null;
  script: TourScript | null;
  stepIndex: number;
}

export type TourAction =
  | { type: "start"; messageId: string; script: TourScript }
  | { type: "goTo"; index: number }
  | { type: "next" }
  | { type: "prev" }
  | { type: "exit" };

export const initialTourState: TourState = { status: "idle", messageId: null, script: null, stepIndex: 0 };

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "start":
      return { status: "active", messageId: action.messageId, script: action.script, stepIndex: 0 };

    case "goTo": {
      if (!state.script || state.status === "idle") return state;
      const last = state.script.steps.length - 1;
      return { ...state, status: "active", stepIndex: Math.min(Math.max(action.index, 0), last) };
    }

    case "next": {
      if (!state.script || state.status !== "active") return state;
      return state.stepIndex >= state.script.steps.length - 1
        ? { ...state, status: "done" }
        : { ...state, stepIndex: state.stepIndex + 1 };
    }

    case "prev":
      return state.status === "active" ? { ...state, stepIndex: Math.max(state.stepIndex - 1, 0) } : state;

    case "exit":
      return initialTourState;
  }
}

/** The label to highlight right now, if any. */
export function activeLabel(state: TourState) {
  return state.status === "active" ? (state.script?.steps[state.stepIndex]?.label ?? null) : null;
}
