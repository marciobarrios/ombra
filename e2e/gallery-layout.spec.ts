import { expect, test } from "@playwright/test";

import { bentoLayout, frameRatio, overflowIndex } from "../registry/ombra/gallery-layout";

// MAR-26: the bento's tiles and overflow, and the mosaic's row ratios.
test.describe("gallery layouts", () => {
  test("every photo gets a tile while they fit", () => {
    expect(bentoLayout(0)).toEqual({ tiles: 0, regular: 0, hidden: 0 });
    expect(bentoLayout(3)).toEqual({ tiles: 3, regular: 3, hidden: 0 });
    expect(bentoLayout(5)).toEqual({ tiles: 5, regular: 5, hidden: 0 });
  });

  test("past the limit, the last tile counts the photo it shows with the rest", () => {
    expect(bentoLayout(6)).toEqual({ tiles: 5, regular: 4, hidden: 2 });
    expect(bentoLayout(12, 3)).toEqual({ tiles: 3, regular: 2, hidden: 10 });
    expect(bentoLayout(2, 1)).toEqual({ tiles: 1, regular: 0, hidden: 2 });
  });

  test("the limit stays between one tile and the largest template", () => {
    expect(bentoLayout(9, 12)).toEqual({ tiles: 5, regular: 4, hidden: 5 });
    expect(bentoLayout(4, 0)).toEqual({ tiles: 1, regular: 0, hidden: 4 });
    expect(bentoLayout(4, Number.NaN)).toEqual({ tiles: 1, regular: 0, hidden: 4 });
  });

  test("the overflow tile follows a hidden photo the open viewer shows, and only a hidden one", () => {
    expect(overflowIndex(-1, 4, 8)).toBe(4);
    expect(overflowIndex(2, 4, 8)).toBe(4);
    expect(overflowIndex(6, 4, 8)).toBe(6);
    expect(overflowIndex(8, 4, 8)).toBe(4);
  });

  test("reads a frame as width over height", () => {
    expect(frameRatio("3 / 2")).toBe(1.5);
    expect(frameRatio("1600/1067")).toBeCloseTo(1.4995);
    expect(frameRatio("2")).toBe(2);
    expect(frameRatio("auto")).toBe(1);
    expect(frameRatio("3 / 0")).toBe(1);
  });
});
