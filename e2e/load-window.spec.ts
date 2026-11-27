import { expect, test } from "@playwright/test";

import { loadOrder, loadReach } from "../registry/ombra/load-window";

// MAR-24: the viewer loads the active photo first, then one neighbour on each side.
test.describe("load window", () => {
  const ids = ["a", "b", "c", "d", "e"];

  test("loads the active photo first, then the next and the previous", () => {
    expect(loadOrder(ids, 2, 1)).toEqual(["c", "d", "b"]);
  });

  test("stops at the ends of the list", () => {
    expect(loadOrder(ids, 0, 1)).toEqual(["a", "b"]);
    expect(loadOrder(ids, 4, 1)).toEqual(["e", "d"]);
    expect(loadOrder(["a"], 0, 1)).toEqual(["a"]);
  });

  test("loads nothing for an active index outside the list", () => {
    expect(loadOrder(ids, -1, 1)).toEqual([]);
    expect(loadOrder(ids, 5, 1)).toEqual([]);
  });

  test("reaches one photo each side, and none on a saving or 2G connection", () => {
    expect(loadReach(null)).toBe(1);
    expect(loadReach({ effectiveType: "4g" })).toBe(1);
    expect(loadReach({ effectiveType: "3g" })).toBe(1);
    expect(loadReach({ saveData: true, effectiveType: "4g" })).toBe(0);
    expect(loadReach({ effectiveType: "2g" })).toBe(0);
    expect(loadReach({ effectiveType: "slow-2g" })).toBe(0);
    expect(loadOrder(ids, 2, 0)).toEqual(["c"]);
  });
});
