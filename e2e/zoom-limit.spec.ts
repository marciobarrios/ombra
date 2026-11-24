import { expect, test } from "@playwright/test";

import {
  clampZoom,
  FALLBACK_ZOOM_CEILING,
  resistZoom,
  zoomCeiling,
} from "../registry/ombra/zoom-limit";

// MAR-21: zoom stops at the media's natural size unless the consumer gives a hint.
test.describe("zoom ceiling", () => {
  test("stops where the media shows at its natural width", () => {
    expect(zoomCeiling(1600, 400)).toBe(4);
    expect(zoomCeiling(1600, 1000)).toBe(1.6);
  });

  test("never drops below 1, so media already at natural size does not zoom", () => {
    expect(zoomCeiling(800, 1200)).toBe(1);
  });

  test("a hint replaces the natural limit, and still never drops below 1", () => {
    expect(zoomCeiling(800, 1200, 3)).toBe(3);
    expect(zoomCeiling(1600, 400, 2)).toBe(2);
    expect(zoomCeiling(1600, 400, 0.5)).toBe(1);
  });

  test("falls back when a width is unknown or the hint is not a scale", () => {
    expect(zoomCeiling(0, 400)).toBe(FALLBACK_ZOOM_CEILING);
    expect(zoomCeiling(1600, 0)).toBe(FALLBACK_ZOOM_CEILING);
    expect(zoomCeiling(1600, 800, Number.NaN)).toBe(2);
    expect(zoomCeiling(1600, 800, 0)).toBe(2);
  });

  test("clamps a resting scale and resists a pinch past either limit", () => {
    expect(clampZoom(0.5, 2)).toBe(1);
    expect(clampZoom(3, 2)).toBe(2);
    expect(clampZoom(1.5, 2)).toBe(1.5);
    expect(resistZoom(1.5, 2)).toBe(1.5);
    expect(resistZoom(3, 2)).toBeCloseTo(2.28);
    expect(resistZoom(0.5, 2)).toBeCloseTo(0.86);
  });
});
