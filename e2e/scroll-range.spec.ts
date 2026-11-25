import { expect, test } from "@playwright/test";

import { scrollLeftRange } from "../registry/ombra/scroll-range";

test.describe("scroll range", () => {
  test("runs from zero up left to right and from zero down right to left", () => {
    expect(scrollLeftRange(3000, 1000, false)).toEqual({ min: 0, max: 2000 });
    expect(scrollLeftRange(3000, 1000, true)).toEqual({ min: -2000, max: 0 });
  });

  test("is empty when nothing overflows", () => {
    expect(scrollLeftRange(800, 1000, false)).toEqual({ min: 0, max: 0 });
    expect(scrollLeftRange(800, 1000, true)).toEqual({ min: -0, max: 0 });
  });
});
