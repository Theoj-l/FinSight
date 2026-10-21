import { describe, expect, it } from "vitest";
import { activeLabel, initialTourState, tourReducer, type TourState } from "./tour-state";
import type { TourScript } from "./tour-script";

const script: TourScript = {
  opening: "Welcome",
  steps: [
    { label: "filters", explanation: "one" },
    { label: "kpi-cards", explanation: "two" },
    { label: "profit-loss", explanation: "three" },
  ],
};

const active = (stepIndex = 0): TourState => ({ status: "active", messageId: "m1", script, stepIndex });

describe("tourReducer", () => {
  it("starts at the first step and remembers which message owns it", () => {
    expect(tourReducer(initialTourState, { type: "start", messageId: "m1", script })).toEqual(active(0));
  });

  it("starting another message's walkthrough replaces the running one", () => {
    const next = tourReducer(active(2), { type: "start", messageId: "m2", script });
    expect(next).toEqual({ status: "active", messageId: "m2", script, stepIndex: 0 });
  });

  it("advances, goes back, and never leaves the step range", () => {
    expect(tourReducer(active(0), { type: "next" }).stepIndex).toBe(1);
    expect(tourReducer(active(1), { type: "prev" }).stepIndex).toBe(0);
    expect(tourReducer(active(0), { type: "prev" }).stepIndex).toBe(0);
    expect(tourReducer(active(0), { type: "goTo", index: 99 }).stepIndex).toBe(2);
    expect(tourReducer(active(2), { type: "goTo", index: -5 }).stepIndex).toBe(0);
  });

  it("finishes after the last step and can replay from the list", () => {
    const done = tourReducer(active(2), { type: "next" });
    expect(done.status).toBe("done");
    expect(tourReducer(done, { type: "goTo", index: 0 })).toEqual(active(0));
  });

  it("clears everything on exit", () => {
    expect(tourReducer(active(1), { type: "exit" })).toEqual(initialTourState);
  });

  it("ignores navigation when nothing is running", () => {
    expect(tourReducer(initialTourState, { type: "next" })).toBe(initialTourState);
    expect(tourReducer(initialTourState, { type: "goTo", index: 1 })).toBe(initialTourState);
    expect(tourReducer(initialTourState, { type: "prev" })).toBe(initialTourState);
  });
});

describe("activeLabel", () => {
  it("is the current step's label only while active", () => {
    expect(activeLabel(active(1))).toBe("kpi-cards");
    expect(activeLabel(tourReducer(active(2), { type: "next" }))).toBeNull();
    expect(activeLabel(initialTourState)).toBeNull();
  });
});
