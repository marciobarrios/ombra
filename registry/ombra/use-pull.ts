"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import { MORPH_EASING } from "./morph";
import { SNAP_SPRING, normalizeVelocity, springCurve } from "./spring";
import { useReducerWithBailout } from "./use-reducer-with-bailout";

const AXIS_LOCK_PX = 8;
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 700;
const VELOCITY_WINDOW_MS = 130;

/** A pull of this share of the viewport height is full progress. */
const PULL_SPAN = 0.62;

/** A wheel has no release, so a trackpad swipe ends once the wheel goes quiet this long. */
const WHEEL_IDLE_MS = 140;

/**
 * The momentum after a dismissal is swallowed until the wheel goes quiet this long.
 * Longer than the gesture's idle, because a tail that stutters past it would scroll
 * the page, and a scroll swallowed just after a close costs nothing.
 */
const MOMENTUM_IDLE_MS = 300;

/** A wheel flick also has to travel this far, so a single fast event cannot close. */
const WHEEL_FLICK_DISTANCE = 32;

const LINE_HEIGHT_PX = 16;

type Sample = {
  y: number;
  t: number;
};

type PullAction = { type: "pull-started" } | { type: "pull-ended" };

/** True from the moment a drag locks to the vertical axis until the finger lifts. */
function pullReducer(_pulling: boolean, action: PullAction): boolean {
  return action.type === "pull-started";
}

/**
 * Pulls the viewer up or down to dismiss it. `--ombra-pull-live` is signed:
 * positive while the photo is pulled down, negative while it is pushed up.
 *
 * A finger or mouse drags with pointer events. A trackpad swipe arrives as wheel
 * events and drives the same pull, with the content following the fingers the way
 * a scroll does. It dismisses as soon as it crosses the threshold, because its
 * momentum keeps arriving after the fingers lift and would otherwise hold the pull.
 *
 * Takes the track element rather than a ref: an opening enables the pull before
 * the dialog portal has mounted the track, and the listeners must bind once it has.
 */
export function usePull(
  track: HTMLElement | null,
  enabled: boolean,
  opening: boolean,
  readyRef: RefObject<boolean>,
  reduced: boolean,
  slow: boolean,
  spring: boolean,
  onDismiss: (velocity: number) => void,
): boolean {
  const enabledRef = useRef(enabled);
  const openingRef = useRef(opening);
  const reducedRef = useRef(reduced);
  const slowRef = useRef(slow);
  const springRef = useRef(spring);
  const onDismissRef = useRef(onDismiss);
  // A tap or swipe ends with `pull-ended` too, and the bail-out keeps it from rendering.
  const [pulling, dispatchPull] = useReducerWithBailout(pullReducer, false);

  enabledRef.current = enabled;
  openingRef.current = opening;
  reducedRef.current = reduced;
  slowRef.current = slow;
  springRef.current = spring;
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!track) return;

    // One gesture at a time: a pointer drag or a trackpad swipe.
    let source: "pointer" | "wheel" | null = null;
    let pointerId = -1;
    let axis: "x" | "y" | null = null;
    let startX = 0;
    let startY = 0;
    // Signed vertical travel of the current gesture, positive downward.
    let offset = 0;
    let wheelX = 0;
    let wheelTimer = 0;
    const samples: Sample[] = [];

    let snap: Animation | null = null;

    const readProgress = () =>
      Number(document.documentElement.style.getPropertyValue("--ombra-pull-live") || "0");

    const setProgress = (value: number) => {
      document.documentElement.style.setProperty("--ombra-pull-live", String(value));
    };

    /** Stops a snap-back where it is, so the next gesture starts from what is on screen. */
    const cancelSnap = () => {
      const animation = snap;

      if (!animation) return;

      const live = getComputedStyle(document.documentElement).getPropertyValue("--ombra-pull-live");

      snap = null;
      animation.cancel();
      setProgress(Number(live) || 0);
    };

    const settleBack = (pixelsPerSecond: number) => {
      const from = readProgress();

      cancelSnap();

      if (from === 0) return;

      let duration = reducedRef.current ? 0 : slowRef.current ? 900 : 320;
      let easing: string = MORPH_EASING;

      if (springRef.current && !reducedRef.current) {
        const span = window.innerHeight * PULL_SPAN * from;
        // The spring wants the speed toward rest, which is against the pull.
        const towardRest = from > 0 ? -pixelsPerSecond : pixelsPerSecond;

        const curve = springCurve({
          ...SNAP_SPRING,
          velocity: Math.abs(from) > 0.04 ? normalizeVelocity(towardRest, span) : 0,
        });

        duration = slowRef.current ? curve.duration * 3 : curve.duration;
        easing = curve.easing;
      }

      const animation = document.documentElement.animate(
        [{ "--ombra-pull-live": String(from) }, { "--ombra-pull-live": "0" }],
        { duration, easing, fill: "forwards" },
      );

      snap = animation;

      void animation.finished.then(
        () => {
          if (snap !== animation) return;

          snap = null;
          setProgress(0);
        },
        () => undefined,
      );
    };

    const begin = (kind: "pointer" | "wheel", t: number) => {
      cancelSnap();
      source = kind;
      axis = null;
      offset = 0;
      samples.length = 0;
      samples.push({ y: 0, t });
    };

    const record = (t: number) => {
      samples.push({ y: offset, t });

      while (samples[0] && t - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();
    };

    const follow = (dy: number, t: number) => {
      offset = dy;

      if (!reducedRef.current) {
        const span = window.innerHeight * PULL_SPAN;

        setProgress(Math.min(1, Math.max(-1, dy / span)));
      }

      record(t);
    };

    const dismiss = (velocity: number) => {
      cancelSnap();

      if (reducedRef.current) setProgress(0);

      onDismissRef.current(velocity);
    };

    /**
     * While the photo is still flying in, a vertical drag cuts the opening and
     * closes from wherever the photo is. The sheet cannot follow the finger yet,
     * because the visible photo is the clone outside it. Returns false then.
     */
    const lockVertical = (dy: number, t: number): boolean => {
      if (!openingRef.current) {
        dispatchPull({ type: "pull-started" });

        return true;
      }

      source = null;
      axis = null;
      offset = dy;
      record(t);
      onDismissRef.current(verticalSpeed(samples));

      return false;
    };

    /** Ends the gesture and either dismisses or springs the sheet back. */
    const release = () => {
      const vertical = axis === "y";
      const wheel = source === "wheel";

      source = null;
      axis = null;
      window.clearTimeout(wheelTimer);
      dispatchPull({ type: "pull-ended" });

      if (!vertical) {
        // A tap that caught a snap-back mid-way still has to finish it.
        if (!reducedRef.current) settleBack(0);

        return;
      }

      // A wheel goes quiet only once the fingers have stopped, and `onWheel` already
      // dismissed anything past the thresholds, so its end always springs back.
      if (wheel) {
        if (!reducedRef.current) settleBack(0);

        return;
      }

      const velocity = verticalSpeed(samples);
      // A flick only counts in the direction of the pull, so flicking back cancels.
      const outward = offset >= 0 ? velocity : -velocity;

      if (Math.abs(offset) > DISMISS_DISTANCE || outward > DISMISS_VELOCITY) {
        dismiss(velocity);

        return;
      }

      if (!reducedRef.current) settleBack(velocity);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!enabledRef.current || !readyRef.current) return;

      if (event.pointerType === "mouse" && event.button !== 0) return;

      if (source === "pointer") return;

      // A finger on the trackpad's surface takes over from a wheel swipe.
      if (source === "wheel") {
        window.clearTimeout(wheelTimer);
        dispatchPull({ type: "pull-ended" });
      }

      begin("pointer", event.timeStamp);
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (source !== "pointer" || event.pointerId !== pointerId) return;

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      if (!axis) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;

        axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";

        if (axis === "x") return;

        if (!lockVertical(dy, event.timeStamp)) return;

        try {
          track.setPointerCapture(event.pointerId);
        } catch (error) {
          // The pointer can already be gone. The pull still follows the events we have.
          if (!(error instanceof DOMException)) throw error;
        }
      }

      if (axis !== "y") return;

      follow(dy, event.timeStamp);
    };

    const finish = (event: PointerEvent) => {
      if (source !== "pointer" || event.pointerId !== pointerId) return;

      release();
    };

    const onWheel = (event: WheelEvent) => {
      // A trackpad pinch arrives as ctrl+wheel, and the zoom hook owns it.
      if (event.ctrlKey || source === "pointer") return;

      if (source === null) {
        if (!enabledRef.current || !readyRef.current) return;

        begin("wheel", event.timeStamp);
        wheelX = 0;
      }

      const unit = wheelUnit(event);

      // The content follows the fingers, as a scroll does: fingers down pull the photo down.
      wheelX -= event.deltaX * unit;

      const dy = offset - event.deltaY * unit;

      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(release, WHEEL_IDLE_MS);

      if (!axis) {
        if (wheelX === 0 && dy === 0) return;

        // A trackpad swipe says its direction in its first event; waiting would let
        // the first pixels of a horizontal swipe go missing from the native scroll.
        axis = Math.abs(dy) > Math.abs(wheelX) ? "y" : "x";

        if (axis === "y") {
          event.preventDefault();

          if (!lockVertical(dy, event.timeStamp)) {
            window.clearTimeout(wheelTimer);
            swallowWheelMomentum();

            return;
          }
        }
      }

      // A horizontal swipe stays with the track's native scroll until the wheel goes quiet.
      if (axis !== "y") return;

      event.preventDefault();
      follow(dy, event.timeStamp);

      const velocity = verticalSpeed(samples);
      const outward = offset >= 0 ? velocity : -velocity;
      const far = Math.abs(offset) > DISMISS_DISTANCE;
      const flick = Math.abs(offset) > WHEEL_FLICK_DISTANCE && outward > DISMISS_VELOCITY;

      if (!far && !flick) return;

      source = null;
      axis = null;
      window.clearTimeout(wheelTimer);
      dispatchPull({ type: "pull-ended" });
      swallowWheelMomentum();
      dismiss(velocity);
    };

    // pointerup is listened on window so a release outside the track cannot
    // leave the gesture stuck and ignore the next one.
    track.addEventListener("pointerdown", onPointerDown);
    track.addEventListener("pointermove", onPointerMove);
    track.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);

    return () => {
      track.removeEventListener("pointerdown", onPointerDown);
      track.removeEventListener("pointermove", onPointerMove);
      track.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.clearTimeout(wheelTimer);
      cancelSnap();
      // A pinch or a close can unbind the track mid-pull, and the lift never reaches `release`.
      dispatchPull({ type: "pull-ended" });
      setProgress(0);
    };
  }, [track, enabled]);

  return pulling;
}

/** Signed vertical speed in pixels per second, positive downward. */
function verticalSpeed(samples: readonly Sample[]): number {
  const oldest = samples[0];
  const newest = samples[samples.length - 1];

  if (!oldest || !newest || newest.t <= oldest.t) return 0;

  return ((newest.y - oldest.y) / (newest.t - oldest.t)) * 1000;
}

function wheelUnit(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return LINE_HEIGHT_PX;

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return window.innerHeight;

  return 1;
}

/**
 * A trackpad keeps sending momentum after the swipe that closed the viewer. Without
 * this, the tail scrolls the page once the dialog is gone. It outlives the hook,
 * whose listeners unbind as soon as the close starts.
 */
function swallowWheelMomentum() {
  let timer = 0;

  const swallow = (event: WheelEvent) => {
    if (event.ctrlKey) return;

    event.preventDefault();
    window.clearTimeout(timer);
    timer = window.setTimeout(stop, MOMENTUM_IDLE_MS);
  };

  const stop = () => {
    window.removeEventListener("wheel", swallow, true);
  };

  window.addEventListener("wheel", swallow, { capture: true, passive: false });
  timer = window.setTimeout(stop, MOMENTUM_IDLE_MS);
}
