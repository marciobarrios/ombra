/**
 * Momentum only ever slows down. A wheel event this much bigger than the quietest
 * one since the viewer went away (times the ratio, plus the pixels) is the fingers
 * scrolling again.
 */
const MOMENTUM_RISE_RATIO = 1.5;
const MOMENTUM_RISE_PX = 4;

/**
 * This many wheel events in a row that do not slow down, each at least this big,
 * are a scroll too: mouse wheel notches stay the same size, while momentum shrinks
 * every frame and only holds steady once it is down to a few pixels.
 */
const MOMENTUM_STEADY_EVENTS = 3;
const MOMENTUM_STEADY_PX = 12;

/**
 * What the momentum swallow knows about the wheel stream after the swipe that
 * closed the viewer. No DOM here, so the decisions have a unit spec.
 */
export type MomentumTail = {
  /** The sign of the closing swipe's `deltaY`, which its momentum keeps. */
  direction: number;
  /** The size of the last event seen. */
  previous: number;
  /** Whether any event so far was smaller than the one before it. */
  slowed: boolean;
  /** The smallest event since the viewer went away and the tail slowed, or null. */
  quietest: number | null;
  /** Events in a row since the viewer went away that did not slow down. */
  steady: number;
};

export type MomentumVerdict = "swallow" | "release";

/** The tail after an event, and whether that event was momentum. */
export type MomentumJudgement = {
  tail: MomentumTail;
  verdict: MomentumVerdict;
};

/** `lastDelta` is the closing event's `deltaY` in pixels. */
export function startMomentumTail(lastDelta: number): MomentumTail {
  return {
    direction: Math.sign(lastDelta),
    previous: Math.abs(lastDelta),
    slowed: false,
    quietest: null,
    steady: 0,
  };
}

/**
 * Judges one wheel event (deltas in pixels) against the tail so far.
 *
 * While the viewer is on screen, every event in the swipe's direction is swallowed:
 * a quick swipe closes the viewer while the fingers still speed up, so its momentum
 * peaks during the close, and real momentum is too noisy to tell from a new scroll
 * (Chrome merges events when it is busy, so a tail can jump from 24 to 114).
 *
 * Once the viewer is gone, only the tail is swallowed. A swipe that has not slowed
 * yet is still the closing swipe speeding up (a reduced-motion close ends at once),
 * so the wheel only counts as speeding up again once the tail has slowed, measured
 * from the last event of the close rather than from the closing event, which a
 * quick swipe left far behind. The swallow ends as soon as the wheel speeds up
 * again, or holds the same size (mouse wheel notches). A turn or a sideways swipe
 * ends it at any time, since momentum never does either.
 */
export function judgeMomentum(
  tail: MomentumTail,
  deltaX: number,
  deltaY: number,
  viewerOpen: boolean,
): MomentumJudgement {
  const size = Math.abs(deltaY);
  const turned = (deltaY !== 0 && Math.sign(deltaY) !== tail.direction) || Math.abs(deltaX) > size;
  const slowed = tail.slowed || size < tail.previous;

  if (viewerOpen) {
    return {
      tail: { ...tail, previous: size, slowed },
      verdict: turned ? "release" : "swallow",
    };
  }

  const quietest = tail.slowed ? (tail.quietest ?? tail.previous) : null;
  const rose = quietest !== null && size > quietest * MOMENTUM_RISE_RATIO + MOMENTUM_RISE_PX;
  // Before the tail slows, a growing event is the swipe speeding up, not a notch.
  const held = tail.slowed ? size >= tail.previous : size === tail.previous;
  const steady = held && size >= MOMENTUM_STEADY_PX ? tail.steady + 1 : 0;

  return {
    tail: {
      ...tail,
      previous: size,
      slowed,
      quietest: slowed ? Math.min(quietest ?? size, size) : null,
      steady,
    },
    verdict: turned || rose || steady >= MOMENTUM_STEADY_EVENTS ? "release" : "swallow",
  };
}
