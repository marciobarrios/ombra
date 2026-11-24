/**
 * Which part of the viewer owns a gesture: the native scroll-snap track, the zoom
 * surface, or the pull to dismiss. The hooks that run each part ask here before they
 * act, so two of them never move the photo at once (MAR-22).
 *
 * | Mode     | Drag x | Drag y | Pinch | Wheel x | Wheel y | Wheel pinch |
 * | -------- | ------ | ------ | ----- | ------- | ------- | ----------- |
 * | idle     | track  | pull   | zoom  | track   | pull    | zoom        |
 * | flinging | track  | pull   | none  | track   | pull    | none        |
 * | zoomed   | zoom   | zoom   | zoom  | zoom    | zoom    | zoom        |
 * | handoff  | zoom   | zoom   | none  | zoom    | zoom    | none        |
 * | pulling  | pull   | pull   | none  | pull    | pull    | none        |
 * | pinching | zoom   | zoom   | zoom  | zoom    | zoom    | zoom        |
 *
 * - A pinch while the track is still moving waits until it rests on a slide, so the
 *   zoom never starts with two slides on screen. Fingers that lift first leave
 *   nothing behind.
 * - While zoomed, a drag pans the photo. A pan past the photo's edge moves the track
 *   (the hand-off), and the zoom hook still drives it, so the drag cannot change
 *   slide by itself. A second finger during the hand-off is ignored.
 * - A pull keeps every finger until it is released, so a pinch cannot scale a photo
 *   that is being dismissed.
 *
 * No React import: the gallery variants share it, and the table is unit tested.
 */

export type GestureMode = "idle" | "flinging" | "zoomed" | "handoff" | "pulling" | "pinching";

export type GestureInput = "drag-x" | "drag-y" | "pinch" | "wheel-x" | "wheel-y" | "wheel-pinch";

/** `none` means nothing moves: the input is ignored, or waits for the mode to change. */
export type GestureOwner = "track" | "zoom" | "pull" | "none";

export type GestureSignals = {
  /** A drag or a trackpad swipe has locked to the vertical axis and pulls the viewer. */
  pulling: boolean;
  /** Two fingers are scaling the photo. */
  pinching: boolean;
  /** A zoomed pan has passed the photo's edge and moves the track. */
  handoff: boolean;
  /** The photo rests above its fitted size. */
  zoomed: boolean;
  /** The track rests on a slide: not scrolling, snapping, or held between two slides. */
  rested: boolean;
};

export const GESTURE_TABLE: Readonly<
  Record<GestureMode, Readonly<Record<GestureInput, GestureOwner>>>
> = {
  idle: {
    "drag-x": "track",
    "drag-y": "pull",
    pinch: "zoom",
    "wheel-x": "track",
    "wheel-y": "pull",
    "wheel-pinch": "zoom",
  },
  flinging: {
    "drag-x": "track",
    "drag-y": "pull",
    pinch: "none",
    "wheel-x": "track",
    "wheel-y": "pull",
    "wheel-pinch": "none",
  },
  zoomed: {
    "drag-x": "zoom",
    "drag-y": "zoom",
    pinch: "zoom",
    "wheel-x": "zoom",
    "wheel-y": "zoom",
    "wheel-pinch": "zoom",
  },
  handoff: {
    "drag-x": "zoom",
    "drag-y": "zoom",
    pinch: "none",
    "wheel-x": "zoom",
    "wheel-y": "zoom",
    "wheel-pinch": "none",
  },
  pulling: {
    "drag-x": "pull",
    "drag-y": "pull",
    pinch: "none",
    "wheel-x": "pull",
    "wheel-y": "pull",
    "wheel-pinch": "none",
  },
  pinching: {
    "drag-x": "zoom",
    "drag-y": "zoom",
    pinch: "zoom",
    "wheel-x": "zoom",
    "wheel-y": "zoom",
    "wheel-pinch": "zoom",
  },
};

/**
 * The mode a set of signals puts the viewer in. A gesture that already holds the photo
 * outranks the state underneath it: a pull, then a pinch, then a hand-off. A zoomed
 * photo holds the track still, so it outranks a track that has not come to rest.
 */
export function gestureMode(signals: GestureSignals): GestureMode {
  if (signals.pulling) return "pulling";

  if (signals.pinching) return "pinching";

  if (signals.handoff) return "handoff";

  if (signals.zoomed) return "zoomed";

  if (!signals.rested) return "flinging";

  return "idle";
}

export function gestureOwner(mode: GestureMode, input: GestureInput): GestureOwner {
  return GESTURE_TABLE[mode][input];
}
