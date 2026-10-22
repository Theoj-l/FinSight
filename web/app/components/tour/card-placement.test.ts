import { describe, expect, it } from "vitest";
import { placeWalkthroughCard } from "./card-placement";

const viewport = { width: 1440, height: 900 };
const place = (button: { x: number; y: number } | null, vp = viewport) => placeWalkthroughCard(button, vp, 56, 20, 12);

describe("placeWalkthroughCard", () => {
  it("puts the card to the left of the button, bottom edges level", () => {
    // Default position: bottom-right corner.
    const card = place({ x: 1440 - 20 - 56, y: 900 - 20 - 56 });
    expect(card).toMatchObject({ width: 320, bottom: 20 });
    expect(card?.right).toBe(1440 - (1440 - 76) + 12); // 76 from the right edge + gap
    expect(card?.left).toBeUndefined();
  });

  it("keeps the card inside the screen vertically when the button is high up", () => {
    const card = place({ x: 1300, y: 100 });
    expect(card).not.toBeNull();
    expect(card!.maxHeight).toBe(900 - card!.bottom - 20);
  });

  it("moves to the right of the button when it is dragged to the left edge", () => {
    const card = place({ x: 30, y: 800 });
    expect(card?.left).toBe(30 + 56 + 12);
    expect(card?.right).toBeUndefined();
  });

  it("goes above the button on a phone-width screen", () => {
    const card = place({ x: 264, y: 724 }, { width: 340, height: 800 });
    expect(card?.width).toBe(300); // shrinks to fit: 340 - 2 x 20
    expect(card?.bottom).toBe(800 - 724 + 12);
    expect(card?.right).toBe(20);
  });

  it("returns null until the button and screen size are known", () => {
    expect(place(null)).toBeNull();
    expect(place({ x: 10, y: 10 }, { width: 0, height: 0 })).toBeNull();
  });
});
