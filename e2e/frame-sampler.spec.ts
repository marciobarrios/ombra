import { expect, test } from "@playwright/test";

import {
  frameReadoutReducer,
  initialFrameReadout,
  summarizeFrames,
} from "../registry/ombra/frame-sampler";

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
      midDropped: 0,
      deltas: [],
    });
  });

  test("scores a run that is slow throughout against the display interval", () => {
    const deltas = [50, 50, 50, 50, 50];

    expect(summarizeFrames(deltas).dropped).toBe(0);
    expect(summarizeFrames(deltas, 33.3).dropped).toBe(5);
    expect(summarizeFrames(deltas, 33.3).midDropped).toBe(3);
  });

  test("leaves first and last frame drops out of the mid-flight count", () => {
    const sample = summarizeFrames([40, 16.7, 16.6, 40, 16.7, 16.7, 40]);

    expect(sample.droppedAt).toEqual([1, 4, 7]);
    expect(sample.midDropped).toBe(1);
  });
});

test.describe("frame readout", () => {
  const smooth = summarizeFrames([16.7, 16.6, 16.7, 16.7]);
  const janky = summarizeFrames([16.7, 40, 16.7, 16.7]);

  test("tallies runs per kind under one condition", () => {
    let state = frameReadoutReducer(initialFrameReadout, {
      type: "sampled",
      kind: "open",
      condition: "flip|false|false",
      sample: smooth,
    });

    state = frameReadoutReducer(state, {
      type: "sampled",
      kind: "open",
      condition: "flip|false|false",
      sample: janky,
    });
    state = frameReadoutReducer(state, {
      type: "sampled",
      kind: "close",
      condition: "flip|false|false",
      sample: smooth,
    });

    expect(state.condition).toBe("flip|false|false");
    expect(state.open).toEqual({ last: janky, runs: 2, clean: 1, mid: 1 });
    expect(state.close).toEqual({ last: smooth, runs: 1, clean: 1, mid: 1 });
  });

  test("starts over when the condition changes", () => {
    const flip = frameReadoutReducer(initialFrameReadout, {
      type: "sampled",
      kind: "close",
      condition: "flip|false|false",
      sample: janky,
    });

    const fade = frameReadoutReducer(flip, {
      type: "sampled",
      kind: "open",
      condition: "fade|false|false",
      sample: smooth,
    });

    expect(fade).toEqual({
      condition: "fade|false|false",
      open: { last: smooth, runs: 1, clean: 1, mid: 1 },
    });
  });
});
