"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { sameScope } from "@/lib/text-to-sql/context";
import { readChatContext, scopeToUrl, type ChatContext } from "../chat/chat-context";
import type { TourLabelId } from "./tour-labels";
import { activeLabel, initialTourState, tourReducer, type TourState } from "./tour-state";
import { pageOfScript, parseTourScript, tourPageFor, type TourPage, type TourScript } from "./tour-script";

// Bump the version suffix to offer the first-visit walkthrough again to everyone.
const SEEN_KEY = "finsight:walkthrough:dashboard:v1";

interface TourContextValue {
  state: TourState;
  /** The page whose labelled parts can be highlighted, or null if this page has none. */
  page: TourPage | null;
  /**
   * Start stepping through a message's walkthrough. If `scope` (or, without one, the page the
   * script's steps are on) differs from what is on screen, that page is first opened, with its
   * filters, and given time to load. Only the steps whose part is on screen are kept. Resolves
   * false (and does nothing) if the page could not be opened or none of the steps can be shown.
   */
  begin: (messageId: string, script: TourScript, scope?: ChatContext | null) => Promise<boolean>;
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

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const onScreen = (scope: ChatContext) => sameScope(readChatContext(window.location.pathname, window.location.search), scope);

/**
 * Wait for the address to show a scope. Next changes the address only once
 * the new page is ready, so this is also the signal that the figures have loaded.
 */
async function waitForScope(scope: ChatContext, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (onScreen(scope)) return true;
    await pause(100);
  }
  return false;
}

/** Wait for the labelled parts to exist: a page's charts can still be loading just after it opens. */
async function waitForTargets(labels: TourLabelId[], timeoutMs = 6_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (labels.every((label) => targetFor(label))) return;
    await pause(150);
  }
}

export function TourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const page = tourPageFor(pathname);
  const [state, dispatch] = useReducer(tourReducer, initialTourState);

  // Highlights belong to one page: leaving it ends the walkthrough.
  const [trackedPage, setTrackedPage] = useState(page);
  if (trackedPage !== page) {
    setTrackedPage(page);
    dispatch({ type: "exit" });
  }

  const begin = useCallback(
    async (messageId: string, script: TourScript, scope?: ChatContext | null) => {
      // Show what the answer is about: open its page (or set its period and units) first.
      const wanted: ChatContext = scope && scope.page !== "other" ? scope : { page: pageOfScript(script), units: [], branches: [] };
      const opening = scope ? !onScreen(wanted) : wanted.page !== page;
      if (opening) {
        router.push(scopeToUrl(wanted), { scroll: false });
        if (!(await waitForScope(wanted))) return false;
        await waitForTargets(script.steps.map((step) => step.label));
        await pause(300); // let the new figures finish painting
      }

      // Only explain what is actually on screen right now.
      const visible = parseTourScript({ ...script, steps: script.steps.filter((step) => targetFor(step.label)) });
      if (!visible) return false;
      dispatch({ type: "start", messageId, script: visible });
      return true;
    },
    [page, router],
  );

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
