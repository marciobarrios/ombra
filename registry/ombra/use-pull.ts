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

    let tracking = false;
    let pointerId = -1;
    let axis: "x" | "y" | null = null;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    const samples: Sample[] = [];

    let snap: Animation | null = null;

    const setProgress = (value: number) => {
      document.documentElement.style.setProperty("--ombra-pull-live", String(value));
    };

    const cancelSnap = () => {
      const animation = snap;

      snap = null;
      animation?.cancel();
    };

    const settleBack = (pixelsPerSecond: number) => {
      const from = Number(
        document.documentElement.style.getPropertyValue("--ombra-pull-live") || "0",
      );

      cancelSnap();

      let duration = reducedRef.current ? 0 : slowRef.current ? 900 : 320;
      let easing: string = MORPH_EASING;

      if (springRef.current && !reducedRef.current) {
        const span = window.innerHeight * 0.62 * from;

        const curve = springCurve({
          ...SNAP_SPRING,
          velocity: from > 0.04 ? normalizeVelocity(-pixelsPerSecond, span) : 0,
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
          document.documentElement.style.setProperty("--ombra-pull-live", "0");
        },
        () => undefined,
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!enabledRef.current || !readyRef.current) return;

      if (event.pointerType === "mouse" && event.button !== 0) return;

      if (tracking) return;

      cancelSnap();
      tracking = true;
      pointerId = event.pointerId;
      axis = null;
      startX = event.clientX;
      startY = event.clientY;
      lastY = event.clientY;
      samples.length = 0;
      samples.push({ y: event.clientY, t: event.timeStamp });
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!tracking || event.pointerId !== pointerId) return;

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      if (!axis) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;

        axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";

        if (axis === "x") return;

        // While the photo is still flying in, a downward drag cuts the opening and
        // closes from wherever the photo is. The sheet cannot follow the finger yet,
        // because the visible photo is the clone outside it.
        if (openingRef.current) {
          tracking = false;
          axis = null;

          if (dy <= 0) return;

          samples.push({ y: event.clientY, t: event.timeStamp });
          onDismissRef.current(downwardSpeed(samples));

          return;
        }

        try {
          track.setPointerCapture(event.pointerId);
        } catch (error) {
          // The pointer can already be gone. The pull still follows the events we have.
          if (!(error instanceof DOMException)) throw error;
        }

        dispatchPull({ type: "pull-started" });
      }

      if (axis !== "y") return;

      if (!reducedRef.current) {
        const progress = Math.min(1, Math.max(0, dy) / (window.innerHeight * 0.62));

        setProgress(progress);
      }

      samples.push({ y: event.clientY, t: event.timeStamp });

      const now = event.timeStamp;

      while (samples[0] && now - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();

      lastY = event.clientY;
    };

    const finish = (event: PointerEvent) => {
      if (!tracking || event.pointerId !== pointerId) return;

      tracking = false;

      const vertical = axis === "y";

      axis = null;
      dispatchPull({ type: "pull-ended" });

      if (!vertical) return;

      const dy = lastY - startY;
      const velocity = downwardSpeed(samples);

      const dismiss = dy > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY;

      if (!dismiss) {
        if (!reducedRef.current) settleBack(velocity);

        return;
      }

      cancelSnap();

      if (reducedRef.current) setProgress(0);

      onDismissRef.current(velocity);
    };

    // pointerup is listened on window so a release outside the track cannot
    // leave `tracking` stuck and ignore the next gesture.
    track.addEventListener("pointerdown", onPointerDown);
    track.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);

    return () => {
      track.removeEventListener("pointerdown", onPointerDown);
      track.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      cancelSnap();
      // A pinch or a close can unbind the track mid-pull, and the lift never reaches `finish`.
      dispatchPull({ type: "pull-ended" });
      document.documentElement.style.setProperty("--ombra-pull-live", "0");
    };
  }, [track, enabled]);

  return pulling;
}

function downwardSpeed(samples: readonly Sample[]): number {
  const oldest = samples[0];
  const newest = samples[samples.length - 1];

  if (!oldest || !newest || newest.t <= oldest.t) return 0;

  return ((newest.y - oldest.y) / (newest.t - oldest.t)) * 1000;
}
