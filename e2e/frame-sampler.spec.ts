import { expect, test } from "@playwright/test";

import { summarizeFrames } from "../registry/ombra/frame-sampler";

test.describe("frame summary", () => {
  test("does not count steady 30 Hz frames as dropped", () => {
    const sample = summarizeFrames([33.3, 33.4, 33.3, 66.6, 33.3, 33.4]);

    expect(sample.intervalMs).toBeCloseTo(33.35, 2);
    expect(sample.dropped).toBe(1);
    expect(sample.droppedAt).toEqual([4]);
    expect(sample.longestMs).toBe(66.6);
  });

  test("counts a skipped 120 Hz frame as dropped", () => {
    const sample = summarizeFrames([8.3, 8.4, 8.3, 16.7, 8.3]);

    expect(sample.intervalMs).toBe(8.3);
    expect(sample.dropped).toBe(1);
  });

  test("keeps 60 Hz jitter out of the dropped count", () => {
    expect(summarizeFrames([16.6, 17.1, 16.2, 18.9, 16.7]).dropped).toBe(0);
  });

  test("returns an empty sample with no frames", () => {
    expect(summarizeFrames([])).toEqual({
      longestMs: 0,
      dropped: 0,
      frames: 0,
      intervalMs: 0,
      droppedAt: [],
    });
  });
});
