import { expect, it } from "vitest";
import { comparisonHoverLayout } from "../components/comparison-hover-layout";

it("follows the selected point to the right with a 12px gap", () => {
  expect(comparisonHoverLayout(1000, 320, 150, 60, 140)).toMatchObject({width:240,left:162,top:72});
});
it("flips left near the right edge and clamps the bottom edge", () => {
  expect(comparisonHoverLayout(1000, 320, 970, 310, 140)).toMatchObject({left:718,top:172});
});
it.each([160, 224, 294, 500])("keeps a compact card within a %dpx chart at every edge", width => {
  for (const x of [0, width / 2, width]) for (const y of [-10, 100, 320]) {
    const card = comparisonHoverLayout(width,320,x,y,180);
    expect(card.left).toBeGreaterThanOrEqual(8);
    expect(card.left+card.width).toBeLessThanOrEqual(width-8);
    expect(card.top).toBeGreaterThanOrEqual(8);
    expect(card.top+180).toBeLessThanOrEqual(312);
  }
});
it("positions using the measured content width and clamps oversized values to the chart", () => {
  expect(comparisonHoverLayout(1000,320,970,100,140,330)).toMatchObject({width:330,left:628});
  expect(comparisonHoverLayout(250,320,245,100,140,330)).toMatchObject({width:234,left:8});
});
