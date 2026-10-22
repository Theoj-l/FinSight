// ---------------------------------------------------------------------------
// card-placement.ts — where the small walkthrough window sits while the chat
// panel is minimized: beside the chat button, so it does not cover the chart or
// table being pointed at. Pure: numbers in, CSS numbers out.
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface CardPlacement {
  width: number;
  maxHeight: number;
  left?: number;
  right?: number;
  bottom: number;
}

const CARD_WIDTH = 320;

/**
 * `button` is the chat button's top-left corner. The card goes to its left, bottom
 * edges level; if there is no room on that side, to its right; on a narrow screen,
 * above it. Returns null until the viewport is known.
 */
export function placeWalkthroughCard(button: Point | null, viewport: Viewport, buttonSize: number, margin: number, gap: number): CardPlacement | null {
  if (!button || viewport.width === 0 || viewport.height === 0) return null;

  const width = Math.min(CARD_WIDTH, viewport.width - margin * 2);
  const buttonBottom = viewport.height - (button.y + buttonSize);

  if (button.x - gap - margin >= width) {
    return { width, right: viewport.width - button.x + gap, bottom: buttonBottom, maxHeight: viewport.height - buttonBottom - margin };
  }

  if (viewport.width - (button.x + buttonSize) - gap - margin >= width) {
    return { width, left: button.x + buttonSize + gap, bottom: buttonBottom, maxHeight: viewport.height - buttonBottom - margin };
  }

  const bottom = viewport.height - button.y + gap;
  return {
    width,
    right: Math.max(margin, viewport.width - button.x - buttonSize),
    bottom,
    maxHeight: Math.max(160, viewport.height - bottom - margin),
  };
}
