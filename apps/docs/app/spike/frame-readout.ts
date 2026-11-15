// The spike's frame-time readout. The registry gallery only reports samples through
// `onFrameSample`; tallying them is a docs concern.

import type { FrameSample, MorphKind } from "../../../../registry/ombra/types";

/** The last sample of one morph kind, and how many runs since the last reset had no dropped frame. */
export type FrameTally = { last: FrameSample; runs: number; clean: number; mid: number };

/** Tallies restart when `condition` (engine, slow motion, spring) changes, so each test row starts at zero. */
export type FrameReadoutState = { condition: string } & Partial<Record<MorphKind, FrameTally>>;

export type FrameReadoutAction = {
  type: "sampled";
  kind: MorphKind;
  condition: string;
  sample: FrameSample;
};

export const initialFrameReadout: FrameReadoutState = { condition: "" };

/** Adds one run to its kind's tally, starting over when the test condition changed. */
export function frameReadoutReducer(
  state: FrameReadoutState,
  action: FrameReadoutAction,
): FrameReadoutState {
  const { kind, condition, sample } = action;
  const base = state.condition === condition ? state : { condition };
  const previous = base[kind];

  return {
    ...base,
    [kind]: {
      last: sample,
      runs: (previous?.runs ?? 0) + 1,
      clean: (previous?.clean ?? 0) + (sample.dropped === 0 ? 1 : 0),
      mid: (previous?.mid ?? 0) + (sample.midDropped === 0 ? 1 : 0),
    },
  };
}
