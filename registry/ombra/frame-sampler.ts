import type { FrameSample } from "./types";

const DROPPED_FRAME_MS = 33;

export type FrameSampler = {
  stop: () => FrameSample;
};

/** rAF sampler that works in Safari, which has no long-animation-frame API. */
export function startFrameSampler(): FrameSampler {
  let longestMs = 0;
  let dropped = 0;
  let frames = 0;
  let last = performance.now();
  let active = true;

  const loop = (now: number) => {
    if (!active) return;

    const delta = now - last;

    last = now;
    frames += 1;

    if (frames > 1) {
      if (delta > longestMs) longestMs = delta;

      if (delta > DROPPED_FRAME_MS) dropped += 1;
    }

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);

  return {
    stop() {
      active = false;

      return { longestMs, dropped, frames };
    },
  };
}
