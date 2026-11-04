"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { MORPH_EASING } from "./morph";
import { SNAP_SPRING, normalizeVelocity, springCurve } from "./spring";

const AXIS_LOCK_PX = 8;
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 700;
const VELOCITY_WINDOW_MS = 130;

type Sample = {
  y: number;
  t: number;
};

export function usePull(
  trackRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  readyRef: RefObject<boolean>,
  reduced: boolean,
  slow: boolean,
  spring: boolean,
  onDismiss: (velocity: number) => void,
): boolean {
  const enabledRef = useRef(enabled);
  const reducedRef = useRef(reduced);
  const slowRef = useRef(slow);
  const springRef = useRef(spring);
  const onDismissRef = useRef(onDismiss);
  const [pulling, setPulling] = useState(false);

  enabledRef.current = enabled;
  reducedRef.current = reduced;
  slowRef.current = slow;
  springRef.current = spring;
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const track = trackRef.current;

    if (!track) return;

    let tracking = false;
    let pointerId = -1;
    let axis: "x" | "y" | null = null;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    const samples: Sample[] = [];

    const setProgress = (value: number) => {
      document.documentElement.style.setProperty("--ombra-pull-live", String(value));
    };

    const settleBack = (pixelsPerSecond: number) => {
      const from = Number(
        document.documentElement.style.getPropertyValue("--ombra-pull-live") || "0",
      );

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

      void animation.finished.then(
        () => {
          document.documentElement.style.setProperty("--ombra-pull-live", "0");
        },
        () => undefined,
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!enabledRef.current || !readyRef.current) return;

      if (event.pointerType === "mouse" && event.button !== 0) return;

      if (tracking) return;

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

        track.setPointerCapture(event.pointerId);
        setPulling(true);
      }

      if (axis !== "y" || reducedRef.current) return;

      const progress = Math.min(1, Math.max(0, dy) / (window.innerHeight * 0.62));

      setProgress(progress);
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
      setPulling(false);

      if (!vertical) return;

      const dy = lastY - startY;
      const oldest = samples[0];
      const newest = samples[samples.length - 1];
      let velocity = 0;

      if (oldest && newest && newest.t > oldest.t) {
        velocity = ((newest.y - oldest.y) / (newest.t - oldest.t)) * 1000;
      }

      const dismiss = dy > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY;

      if (!dismiss) {
        if (!reducedRef.current) settleBack(velocity);

        return;
      }

      if (reducedRef.current) setProgress(0);

      onDismissRef.current(velocity);
    };

    track.addEventListener("pointerdown", onPointerDown);
    track.addEventListener("pointermove", onPointerMove);
    track.addEventListener("pointerup", finish);
    track.addEventListener("pointercancel", finish);

    return () => {
      track.removeEventListener("pointerdown", onPointerDown);
      track.removeEventListener("pointermove", onPointerMove);
      track.removeEventListener("pointerup", finish);
      track.removeEventListener("pointercancel", finish);
      document.documentElement.style.setProperty("--ombra-pull-live", "0");
    };
  }, [trackRef, enabled]);

  return pulling;
}
