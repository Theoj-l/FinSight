"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { activeLabel, initialTourState, tourReducer, type TourState } from "./tour-state";
import { parseTourScript, tourPageFor, type TourPage, type TourScript } from "./tour-script";

// Bump the version suffix to offer the first-visit walkthrough again to everyone.
const SEEN_KEY = "finsight:walkthrough:dashboard:v1";

interface TourContextValue {
  state: TourState;
  /** The page whose labelled parts can be highlighted, or null if this page has none. */
  page: TourPage | null;
  /**
   * Start stepping through a message's walkthrough. Only the steps whose part
   * is on screen are kept. Returns false (and does nothing) if none are.
   */
  begin: (messageId: string, script: TourScript) => boolean;
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  exit: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const value = useContext(TourContext);
  if (!value) throw new Error("useTour must be used inside <TourProvider>");
  return value;
}

/** True the first time this browser opens the dashboard. Fails closed if storage is blocked. */
export function claimFirstVisit(): boolean {
  try {
    if (window.localStorage.getItem(SEEN_KEY)) return false;
    window.localStorage.setItem(SEEN_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

function targetFor(label: string) {
  return document.querySelector<HTMLElement>(`[data-tour-id="${label}"]`);
}

export function TourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const page = tourPageFor(pathname);
  const [state, dispatch] = useReducer(tourReducer, initialTourState);

  // Highlights belong to one page: leaving it ends the walkthrough.
  const [trackedPage, setTrackedPage] = useState(page);
  if (trackedPage !== page) {
    setTrackedPage(page);
    dispatch({ type: "exit" });
  }

  const begin = useCallback((messageId: string, script: TourScript) => {
    // Only explain what is actually on screen right now.
    const onScreen = parseTourScript({ ...script, steps: script.steps.filter((step) => targetFor(step.label)) });
    if (!onScreen) return false;
    dispatch({ type: "start", messageId, script: onScreen });
    return true;
  }, []);

  // Highlight and scroll to the part of the page being explained.
  const label = activeLabel(state);
  useEffect(() => {
    if (!label) return;
    const element = targetFor(label);
    if (!element) return;
    element.setAttribute("data-tour-active", "true");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    return () => element.removeAttribute("data-tour-active");
  }, [label]);

  const value = useMemo<TourContextValue>(
    () => ({
      state,
      page,
      begin,
      goTo: (index) => dispatch({ type: "goTo", index }),
      next: () => dispatch({ type: "next" }),
      prev: () => dispatch({ type: "prev" }),
      exit: () => dispatch({ type: "exit" }),
    }),
    [state, page, begin],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
