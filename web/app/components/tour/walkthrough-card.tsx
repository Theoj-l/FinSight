"use client";

import { Check, ChevronLeft, ChevronRight, Presentation, RotateCcw, X } from "lucide-react";
import { TOUR_LABELS } from "./tour-labels";
import { useTour } from "./tour-context";
import type { TourScript } from "./tour-script";

const chip =
  "grid h-7 min-w-7 place-items-center rounded-full px-1 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue";

/**
 * Under an assistant answer that comes with a walkthrough: a button to start it,
 * and while it runs, the step-by-step card that highlights the charts and tables
 * on the page as each one is explained.
 */
export function WalkthroughCard({ messageId, script }: { messageId: string; script: TourScript }) {
  const { state, page, begin, goTo, next, prev, exit } = useTour();

  // Nothing here to point at (e.g. the answer was given on another page).
  if (!page) return null;

  const running = state.messageId === messageId && state.status !== "idle" && state.script !== null;
  if (!running || !state.script) {
    return (
      <button
        type="button"
        onClick={() => begin(messageId, script)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-brand-blue/30 bg-brand-blue-light/60 px-3 py-1.5 text-xs font-semibold text-brand-navy transition hover:bg-brand-blue-light focus-visible:outline-2 focus-visible:outline-brand-blue"
      >
        <Presentation aria-hidden="true" className="h-3.5 w-3.5 text-brand-blue" />
        Show me on the dashboard · {script.steps.length} {script.steps.length === 1 ? "part" : "parts"}
      </button>
    );
  }

  const { status, stepIndex } = state;
  const steps = state.script.steps;
  const last = steps.length - 1;

  return (
    <section aria-label="Walkthrough" className="mt-2 rounded-2xl border border-brand-blue/30 bg-brand-blue-light/60 p-3.5 text-sm">
      <div className="flex items-center gap-2">
        <Presentation aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-blue" />
        <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-brand-navy">On your dashboard</p>
        <button
          type="button"
          onClick={exit}
          aria-label="Close walkthrough"
          title="Close walkthrough"
          className="grid h-6 w-6 place-items-center rounded-md text-muted transition hover:bg-white hover:text-brand-navy focus-visible:outline-2 focus-visible:outline-brand-blue"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mt-2.5 leading-6 text-foreground">{state.script.opening}</p>

      <ol aria-label="Parts of the dashboard" className="mt-3 flex flex-wrap gap-1.5">
        {steps.map((step, index) => {
          const { number, title } = TOUR_LABELS[step.label];
          const current = status === "active" && index === stepIndex;
          return (
            <li key={step.label}>
              <button
                type="button"
                onClick={() => goTo(index)}
                title={title}
                aria-label={`Part ${index + 1}: ${title}`}
                aria-current={current ? "step" : undefined}
                className={`${chip} ${current ? "bg-brand-red text-white" : "bg-white text-brand-navy ring-1 ring-brand-navy/20 hover:bg-brand-navy hover:text-white"}`}
              >
                {number}
              </button>
            </li>
          );
        })}
      </ol>

      {status === "active" ? (
        <>
          <div aria-live="polite" className="mt-3 rounded-xl bg-white p-3 ring-1 ring-brand-navy/10">
            <p className="text-xs font-semibold text-brand-red">
              {stepIndex + 1} of {steps.length} · {TOUR_LABELS[steps[stepIndex].label].title}
            </p>
            <p className="mt-1.5 leading-6 text-foreground">{steps[stepIndex].explanation}</p>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={prev}
              disabled={stepIndex === 0}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-navy ring-1 ring-brand-navy/20 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand-blue"
            >
              <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
              Back
            </button>
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-navy-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            >
              {stepIndex === last ? "Done" : "Next"}
              {stepIndex === last ? (
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => goTo(0)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-navy ring-1 ring-brand-navy/20 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-brand-blue"
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            Replay
          </button>
          <button
            type="button"
            onClick={exit}
            className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-navy-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
          >
            Close
          </button>
        </div>
      )}
    </section>
  );
}
