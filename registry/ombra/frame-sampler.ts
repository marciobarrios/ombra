import type { FrameSample } from "./types";

/** A frame counts as dropped when it takes this many refresh intervals or more. */
const DROPPED_FRAME_RATIO = 1.5;

export type FrameSampler = {
  stop: () => FrameSample;
};

/**
 * Summarises frame deltas against the display's own refresh interval, taken as the median delta.
 * A fixed threshold would read every frame as dropped at 30 Hz (Low Power Mode) and miss drops at
 * 120 Hz (ProMotion).
 */
export function summarizeFrames(deltas: readonly number[]): FrameSample {
  if (deltas.length === 0) {
    return { longestMs: 0, dropped: 0, frames: 0, intervalMs: 0, droppedAt: [] };
  }

  const sorted = deltas.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  const intervalMs =
    sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;

  const limit = intervalMs * DROPPED_FRAME_RATIO;
  const droppedAt: number[] = [];

  for (const [index, delta] of deltas.entries()) {
    if (delta >= limit) droppedAt.push(index + 1);
  }

  return {
    longestMs: sorted[sorted.length - 1],
    dropped: droppedAt.length,
    droppedAt,
    frames: deltas.length + 1,
    intervalMs,
  };
}

/** rAF sampler that works in Safari, which has no long-animation-frame API. */
export function startFrameSampler(): FrameSampler {
  const deltas: number[] = [];
  let last: number | null = null;
  let active = true;

  const loop = (now: number) => {
    if (!active) return;

    // The first callback only sets the baseline: its delta includes the time before sampling began.
    if (last !== null) deltas.push(now - last);

    last = now;
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);

  return {
    stop() {
      active = false;

      return summarizeFrames(deltas);
    },
  };
}
