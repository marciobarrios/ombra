"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

import { clampZoom, resistZoom, zoomCeiling } from "./zoom-limit";
import { gestureMode, gestureOwner } from "./gesture-arbitration";
import type { GestureInput, GestureOwner } from "./gesture-arbitration";
import { clampScrollLeft } from "./scroll-range";
import { SNAP_SPRING, springCurve } from "./spring";
import { useReducerWithBailout } from "./use-reducer-with-bailout";

type ZoomAction = { type: "zoom-entered" } | { type: "zoom-left" };

/** Whether the photo rests above its fitted size. Only a crossing of that line is an action. */
function zoomReducer(_zoomed: boolean, action: ZoomAction): boolean {
  return action.type === "zoom-entered";
}

type Pose = {
  scale: number;
  x: number;
  y: number;
};

type Point = {
  x: number;
  y: number;
};

// WebKit's GestureEvent, not in lib.dom. macOS Safari sends it for a trackpad pinch
// instead of ctrl+wheel; iOS Safari sends it alongside the touch pointers.
type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };

const TAP_SCALE = 2.5;

// Shared with the chrome tap, so the second tap of a double-tap zooms and does not
// also hide the controls.
export const DOUBLE_TAP_MS = 280;
export const DOUBLE_TAP_DISTANCE = 28;
export const TAP_SLOP = 12;

// A pan past the photo's edge moves the track. On release it pages when the track has
// moved this share of a slide, or on a flick of this many pixels per second.
const HANDOFF_PAGE_SHARE = 0.3;
const HANDOFF_FLICK = 400;
const HANDOFF_SETTLE_MS = 300;
const HANDOFF_WHEEL_IDLE_MS = 140;
const VELOCITY_WINDOW_MS = 100;

export type ZoomControls = {
  zoomed: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  home: () => void;
};

/**
 * What limits the active photo's zoom: the media it scales, the file's natural width, and the
 * consumer's `maxScale` hint, if any.
 */
export type ZoomLimit = { media: HTMLElement; width: number; hint?: number };

function poseFromTransform(transform: string): Pose | null {
  const matrix3d = /matrix3d\(([^)]+)\)/.exec(transform);

  if (matrix3d?.[1]) {
    const parts = matrix3d[1].split(",");
    const scale = Number(parts[0]);
    const x = Number(parts[12]);
    const y = Number(parts[13]);

    if (Number.isFinite(scale) && Number.isFinite(x) && Number.isFinite(y)) return { scale, x, y };
  }

  const matrix = /matrix\(([^)]+)\)/.exec(transform);

  if (matrix?.[1]) {
    const parts = matrix[1].split(",");
    const scale = Number(parts[0]);
    const x = Number(parts[4]);
    const y = Number(parts[5]);

    if (Number.isFinite(scale) && Number.isFinite(x) && Number.isFinite(y)) return { scale, x, y };
  }

  const translate = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(transform);
  const scaled = /scale\(([-\d.]+)\)/.exec(transform);

  if (!translate?.[1] || !translate[2] || !scaled?.[1]) return null;

  return { x: Number(translate[1]), y: Number(translate[2]), scale: Number(scaled[1]) };
}

/** Layout box in screen space. getBoundingClientRect includes the live zoom transform. */
function layoutRect(element: HTMLElement, pose: Pose): DOMRect {
  const visual = element.getBoundingClientRect();
  const scale = Math.abs(pose.scale) > 0.001 ? Math.abs(pose.scale) : 1;
  const width = visual.width / scale;
  const height = visual.height / scale;
  const centerX = visual.left + visual.width / 2 - pose.x;
  const centerY = visual.top + visual.height / 2 - pose.y;

  return new DOMRect(centerX - width / 2, centerY - height / 2, width, height);
}

function zoomAt(prev: Pose, nextScale: number, origin: Point, rect: DOMRect): Pose {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const pointX = origin.x - centerX;
  const pointY = origin.y - centerY;
  const localX = (pointX - prev.x) / prev.scale;
  const localY = (pointY - prev.y) / prev.scale;

  return {
    scale: nextScale,
    x: pointX - localX * nextScale,
    y: pointY - localY * nextScale,
  };
}

function bezier(u: number, p1: number, p2: number): number {
  return 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u * u * p2 + u ** 3;
}

/** The morph easing, cubic-bezier(0.22, 1, 0.36, 1), for a scroll animated frame by frame. */
function easeOut(t: number): number {
  let low = 0;
  let high = 1;
  let u = t;

  for (let step = 0; step < 24; step += 1) {
    u = (low + high) / 2;

    if (bezier(u, 0.22, 0.36) < t) low = u;
    else high = u;
  }

  return bezier(u, 1, 1);
}

/** Distance between neighbouring slide centres, the scroll needed to page once. */
function slideStep(track: HTMLElement): number {
  const slides = track.querySelectorAll<HTMLElement>("[data-slot=ombra-slide]");
  const first = slides[0];
  const second = slides[1];

  if (!first || !second) return track.clientWidth;

  // Right to left, the second slide sits left of the first. The step is a distance.
  return Math.abs(second.offsetLeft - first.offsetLeft);
}

/** The distance from the track's centre to the slide's centre, in pixels. */
function offCentre(track: HTMLElement, slide: Element): number {
  const rect = slide.getBoundingClientRect();

  return rect.left + rect.width / 2 - (track.getBoundingClientRect().left + track.clientWidth / 2);
}

/**
 * Puts the slide in the centre at once. A new scroll ends any smooth scroll still in flight,
 * even one that has not moved yet, so it is issued when the slide already sits there too.
 */
function pinSlide(track: HTMLElement, slide: Element) {
  track.scrollTo({ left: track.scrollLeft + offCentre(track, slide), behavior: "auto" });
}

/**
 * Puts the slide nearest the centre exactly there, at once. A new scroll ends any smooth
 * scroll still in flight, which `overflow: hidden` alone would let carry on.
 */
function pinNearestSlide(track: HTMLElement) {
  let nearest: Element | null = null;
  let distance = Number.POSITIVE_INFINITY;

  for (const slide of track.querySelectorAll("[data-slot=ombra-slide]")) {
    const candidate = Math.abs(offCentre(track, slide));

    if (candidate < distance) {
      nearest = slide;
      distance = candidate;
    }
  }

  if (nearest) pinSlide(track, nearest);
}

function capturePointer(track: HTMLElement, pointerId: number) {
  try {
    track.setPointerCapture(pointerId);
  } catch (error) {
    // The pointer can already be gone. The gesture still follows the events we have.
    if (!(error instanceof DOMException)) throw error;
  }
}

/**
 * Publishes the photo's scale as `--ombra-zoom` on the dialog popup, so its chrome can style
 * against it. Without a scale the popup's default of 1 applies again.
 */
function publishZoom(node: HTMLElement | null, scale?: number) {
  const popup = node?.closest<HTMLElement>("[role=dialog]");

  if (!popup) return;

  if (scale === undefined) popup.style.removeProperty("--ombra-zoom");
  else popup.style.setProperty("--ombra-zoom", String(Math.round(scale * 1000) / 1000));
}

/**
 * While zoomed or pinching, the zoom owns every drag: the track stops scrolling and the
 * browser stops panning it. Otherwise the track scrolls natively again.
 */
function holdTrack(track: HTMLElement | null, held: boolean) {
  if (!track) return;

  track.style.overflowX = held ? "hidden" : "";
  track.style.touchAction = held ? "none" : "";
}

function clearLayers(track: HTMLElement | null) {
  if (!track) return;

  publishZoom(track);

  const layers = track.querySelectorAll<HTMLElement>("[data-slot=ombra-zoom]");

  for (const layer of layers) {
    layer.style.transform = "";
    delete layer.dataset.zoomed;
  }
}

// Without a pull or a track that reports its rest, a pinch is never held back.
const NEVER_PULLING: RefObject<boolean> = { current: false };
const ALWAYS_RESTED: RefObject<boolean> = { current: true };
const NO_LIMIT: RefObject<ZoomLimit | null> = { current: null };

/**
 * Asks for a sharper source the first time a photo zooms: each `img` with a `srcset` gets
 * `sizes` at its magnified width, so the browser picks a larger candidate. The fitted
 * `sizes` would keep the file chosen for the resting box.
 */
function sharpen(layer: HTMLElement, width: number, done: WeakSet<HTMLImageElement>) {
  for (const image of layer.querySelectorAll<HTMLImageElement>("img[srcset]")) {
    if (done.has(image)) continue;

    done.add(image);
    image.sizes = `${Math.round(width)}px`;
  }
}

export function useZoom(
  trackRef: RefObject<HTMLElement | null>,
  layerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  onSettled: () => void,
  spring: boolean,
  slow: boolean,
  reduced: boolean,
  gestureRef: RefObject<boolean>,
  pullingRef: RefObject<boolean> = NEVER_PULLING,
  restedRef: RefObject<boolean> = ALWAYS_RESTED,
  limitRef: RefObject<ZoomLimit | null> = NO_LIMIT,
): ZoomControls {
  const pose = useRef<Pose>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const rectRef = useRef<DOMRect | null>(null);
  // The active photo's zoom ceiling and magnified width, measured with its box.
  const ceilingRef = useRef(zoomCeiling(0, 0));
  const sharpWidth = useRef(0);
  const sharpened = useRef(new WeakSet<HTMLImageElement>());
  const pinchStart = useRef<{ distance: number; pose: Pose; mid: Point } | null>(null);
  const panStart = useRef<{ pointer: Point; pose: Pose } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const pointerType = useRef<string | null>(null);
  const moved = useRef(0);
  // The track's scrollLeft when a pan first passed the photo's edge, or null.
  const handoffHome = useRef<number | null>(null);
  const settleFrame = useRef(0);
  const wheelTimer = useRef(0);
  const panSamples = useRef<{ x: number; t: number }[]>([]);
  const frame = useRef(0);
  const enabledRef = useRef(enabled);
  const onSettledRef = useRef(onSettled);
  const springRef = useRef(spring);
  const slowRef = useRef(slow);
  const reducedRef = useRef(reduced);
  const zoomAnim = useRef<Animation | null>(null);
  const scaleSample = useRef<{ scale: number; t: number } | null>(null);
  const scaleVelocity = useRef(0);
  // Two fingers down only scale the photo once the behaviour table gives them the zoom.
  const pinching = useRef(false);
  // Pan and pinch frames that stay on one side of the line are dropped before they render.
  const [zoomed, dispatchZoom] = useReducerWithBailout(zoomReducer, false);

  enabledRef.current = enabled;
  onSettledRef.current = onSettled;
  springRef.current = spring;
  slowRef.current = slow;
  reducedRef.current = reduced;

  /**
   * Measures the zoom layer's resting box and the photo's zoom ceiling. Layout reads happen
   * here, on a press or a discrete zoom, never in a pointer move.
   */
  const measure = useCallback(
    (layer: HTMLElement): DOMRect => {
      const rect = layoutRect(layer, pose.current);
      const limit = limitRef.current;
      // The fractional width: offsetWidth rounds, which let the ceiling pass natural size.
      const scale = Math.abs(pose.current.scale) > 0.001 ? Math.abs(pose.current.scale) : 1;
      const fitted = limit ? limit.media.getBoundingClientRect().width / scale : 0;
      const ceiling = zoomCeiling(limit?.width ?? 0, fitted, limit?.hint);

      rectRef.current = rect;
      ceilingRef.current = ceiling;
      sharpWidth.current = (fitted > 0 ? fitted : rect.width) * ceiling;

      return rect;
    },
    [limitRef],
  );

  const apply = useCallback(
    (next: Pose, allowHandoff: boolean, limitScale = true) => {
      const layer = layerRef.current;
      const rect = rectRef.current;

      if (!layer || !rect || rect.width <= 0 || rect.height <= 0) return;

      const scale = limitScale ? clampZoom(next.scale, ceilingRef.current) : next.scale;
      const maxX = Math.max(0, ((scale - 1) * rect.width) / 2);
      const maxY = Math.max(0, ((scale - 1) * rect.height) / 2);
      let x = next.x;
      let y = Math.min(maxY, Math.max(-maxY, next.y));
      let overflow = 0;

      if (scale <= 1.001) {
        x = 0;
        y = 0;
      } else if (x > maxX) {
        overflow = x - maxX;
        x = maxX;
      } else if (x < -maxX) {
        overflow = x + maxX;
        x = -maxX;
      }

      pose.current = { scale, x, y };
      layer.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      publishZoom(layer, scale);

      const nowZoomed = scale > 1.02;

      layer.dataset.zoomed = nowZoomed ? "true" : "false";

      if (nowZoomed) sharpen(layer, sharpWidth.current, sharpened.current);

      const track = trackRef.current;

      holdTrack(track, nowZoomed || pinching.current);
      dispatchZoom({ type: nowZoomed ? "zoom-entered" : "zoom-left" });

      if (allowHandoff && track && (overflow !== 0 || handoffHome.current !== null)) {
        // Mandatory snapping would pull every small scroll back to the current slide,
        // so snapping is off until the hand-off settles. The index holds too, so the
        // zoom is not reset while this photo is still on screen.
        if (handoffHome.current === null) {
          handoffHome.current = track.scrollLeft;
          track.style.scrollSnapType = "none";
          gestureRef.current = true;
        }

        // Absolute, not incremental: `overflow` is the whole excess since the pan began.
        track.scrollLeft = handoffHome.current - overflow;
      }
    },
    [gestureRef, layerRef, trackRef],
  );

  /** The pose's x as if the photo had not stopped at its edge: what a new pan starts from. */
  const panX = useCallback((): number => {
    const track = trackRef.current;
    const home = handoffHome.current;

    if (!track || home === null) return pose.current.x;

    return pose.current.x + home - track.scrollLeft;
  }, [trackRef]);

  /** Who the behaviour table gives an input to, from the state of every gesture now. */
  const ownerOf = useCallback(
    (input: GestureInput): GestureOwner =>
      gestureOwner(
        gestureMode({
          pulling: pullingRef.current,
          pinching: pinching.current,
          handoff: handoffHome.current !== null,
          zoomed: pose.current.scale > 1.02,
          rested: restedRef.current,
        }),
        input,
      ),
    [pullingRef, restedRef],
  );

  const endHandoff = useCallback(() => {
    if (settleFrame.current !== 0) cancelAnimationFrame(settleFrame.current);

    settleFrame.current = 0;
    window.clearTimeout(wheelTimer.current);

    if (handoffHome.current === null) return;

    handoffHome.current = null;
    gestureRef.current = false;

    const track = trackRef.current;

    if (track) track.style.scrollSnapType = "";
  }, [gestureRef, trackRef]);

  /** Glides the track to the slide the hand-off chose, then lets the gallery publish it. */
  const settleHandoff = useCallback(
    (velocity: number) => {
      const track = trackRef.current;
      const home = handoffHome.current;

      if (!track || home === null || settleFrame.current !== 0) return;

      const offset = track.scrollLeft - home;
      const step = slideStep(track);
      let direction = Math.abs(offset) > step * HANDOFF_PAGE_SHARE ? Math.sign(offset) : 0;

      // A finger moving left scrolls forward. A flick decides either way.
      if (velocity < -HANDOFF_FLICK) direction = offset > 0 ? 1 : 0;

      if (velocity > HANDOFF_FLICK) direction = offset < 0 ? -1 : 0;

      const target = clampScrollLeft(track, home + direction * step);
      const from = track.scrollLeft;
      const duration = reducedRef.current ? 0 : HANDOFF_SETTLE_MS * (slowRef.current ? 3 : 1);

      const finish = () => {
        track.scrollLeft = target;
        endHandoff();
        onSettledRef.current();
      };

      if (duration === 0 || Math.abs(target - from) < 0.5) {
        finish();

        return;
      }

      const start = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);

        track.scrollLeft = from + (target - from) * easeOut(t);

        if (t < 1) {
          settleFrame.current = requestAnimationFrame(tick);

          return;
        }

        settleFrame.current = 0;
        finish();
      };

      settleFrame.current = requestAnimationFrame(tick);
    },
    [endHandoff, trackRef],
  );

  const stopSpring = useCallback(() => {
    const animation = zoomAnim.current;
    const layer = layerRef.current;

    zoomAnim.current = null;

    if (!animation || !layer) return;

    try {
      animation.commitStyles();
    } catch (error) {
      // commitStyles throws InvalidStateError when the effect has no target.
      // Computed style still reflects the in-flight frame until cancel.
      if (!(error instanceof DOMException)) throw error;
    }

    const live = poseFromTransform(getComputedStyle(layer).transform);

    animation.cancel();

    if (!live) return;

    pose.current = live;
    layer.style.transform = `translate3d(${live.x}px, ${live.y}px, 0) scale(${live.scale})`;
    publishZoom(layer, live.scale);
  }, [layerRef]);

  const animatePose = useCallback(
    (target: Pose, velocity: number) => {
      const layer = layerRef.current;

      if (!layer || !springRef.current || reducedRef.current) {
        apply(target, false);

        return;
      }

      stopSpring();

      const from = pose.current;
      const curve = springCurve({ ...SNAP_SPRING, velocity });
      const duration = slowRef.current ? curve.duration * 3 : curve.duration;

      const animation = layer.animate(
        [
          { transform: `translate3d(${from.x}px, ${from.y}px, 0) scale(${from.scale})` },
          { transform: `translate3d(${target.x}px, ${target.y}px, 0) scale(${target.scale})` },
        ],
        { duration, easing: curve.easing, fill: "forwards" },
      );

      zoomAnim.current = animation;
      pose.current = target;
      // A custom property does not interpolate unregistered, so the settle publishes its end.
      publishZoom(layer, target.scale);

      const nowZoomed = from.scale > 1.02 || target.scale > 1.02;

      layer.dataset.zoomed = nowZoomed ? "true" : "false";

      if (target.scale > 1.02) sharpen(layer, sharpWidth.current, sharpened.current);
      holdTrack(trackRef.current, nowZoomed || pinching.current);
      dispatchZoom({ type: nowZoomed ? "zoom-entered" : "zoom-left" });

      void animation.finished.then(
        () => {
          if (zoomAnim.current !== animation) return;

          const current = layerRef.current;

          if (!current) return;

          try {
            animation.commitStyles();
          } catch (error) {
            if (!(error instanceof DOMException)) throw error;
          }

          const live = poseFromTransform(getComputedStyle(current).transform);

          animation.cancel();
          zoomAnim.current = null;

          if (live) {
            pose.current = live;
            current.style.transform = `translate3d(${live.x}px, ${live.y}px, 0) scale(${live.scale})`;
          }

          const settled = pose.current.scale > 1.02;

          current.dataset.zoomed = settled ? "true" : "false";
          holdTrack(trackRef.current, settled || pinching.current);
          dispatchZoom({ type: settled ? "zoom-entered" : "zoom-left" });
        },
        () => undefined,
      );
    },
    [apply, layerRef, stopSpring, trackRef],
  );

  const animateRef = useRef(animatePose);
  const stopRef = useRef(stopSpring);
  const settleRef = useRef(settleHandoff);
  const panXRef = useRef(panX);
  const ownerRef = useRef(ownerOf);

  animateRef.current = animatePose;
  stopRef.current = stopSpring;
  settleRef.current = settleHandoff;
  panXRef.current = panX;
  ownerRef.current = ownerOf;

  const reset = useCallback(() => {
    endHandoff();
    zoomAnim.current?.cancel();
    zoomAnim.current = null;
    pose.current = { scale: 1, x: 0, y: 0 };
    pinching.current = false;
    pinchStart.current = null;
    panStart.current = null;
    lastTap.current = null;
    pointerType.current = null;

    dispatchZoom({ type: "zoom-left" });

    clearLayers(trackRef.current);

    holdTrack(trackRef.current, false);
  }, [endHandoff, trackRef]);

  const zoomBy = useCallback(
    (factor: number, origin?: Point) => {
      const layer = layerRef.current;

      if (!layer || !enabledRef.current) return;

      stopSpring();

      const rect = measure(layer);

      const point = origin ?? {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      const nextScale = clampZoom(pose.current.scale * factor, ceilingRef.current);
      const next = zoomAt(pose.current, nextScale, point, rect);

      if (springRef.current && !reducedRef.current) {
        animatePose(next, 0);

        return;
      }

      apply(next, false);
    },
    [animatePose, apply, layerRef, measure, stopSpring],
  );

  const zoomIn = useCallback(() => {
    zoomBy(1.25);
  }, [zoomBy]);

  const zoomOut = useCallback(() => {
    zoomBy(1 / 1.25);
  }, [zoomBy]);

  const home = useCallback(() => {
    if (springRef.current && !reducedRef.current && pose.current.scale > 1.02) {
      animatePose({ scale: 1, x: 0, y: 0 }, 0);

      return;
    }

    reset();
  }, [animatePose, reset]);

  useEffect(() => {
    if (enabled) return;

    reset();
  }, [enabled, reset]);

  useEffect(() => {
    const track = trackRef.current;

    if (!track || !enabled) return;

    /**
     * Gives two fingers the zoom once the behaviour table allows it. A pinch that lands
     * while the track still moves waits for it to rest on a slide, and starts from the
     * fingers' spread at that moment, measured against the slide now in the centre.
     */
    const claimPinch = (): boolean => {
      if (pinching.current) return true;

      const layer = layerRef.current;

      if (!layer || ownerRef.current("pinch") !== "zoom") return false;

      pinching.current = true;
      pinchStart.current = null;
      panStart.current = null;
      gestureRef.current = true;

      // A glide can start the frame before its first scroll event says so. Pinning the
      // track ends it, so the zoomed photo cannot travel away with it.
      if (pose.current.scale <= 1.02) pinNearestSlide(track);

      measure(layer);
      holdTrack(track, true);

      return true;
    };

    /**
     * A glide can escape the pin: Firefox runs a smooth scroll off the main thread, so a
     * pin issued before its first frame changes nothing and the glide carries on under
     * `overflow: hidden`. Any scroll during a pinch is that glide, so it goes back.
     */
    const onTrackScroll = () => {
      const slide = layerRef.current?.closest("[data-slot=ombra-slide]");

      if (pinching.current && slide) pinSlide(track, slide);
    };

    /** Lets go of a pinch once fewer than two fingers are down. */
    const releasePinch = () => {
      if (!pinching.current) return;

      pinching.current = false;
      holdTrack(track, pose.current.scale > 1.02 || zoomAnim.current !== null);
    };

    const schedule = () => {
      if (frame.current !== 0) return;

      frame.current = requestAnimationFrame(() => {
        frame.current = 0;

        const rect = rectRef.current;
        const points = [...pointers.current.values()];

        if (!rect || points.length === 0) return;

        if (points.length >= 2 && claimPinch()) {
          const first = points[0];
          const second = points[1];

          if (!first || !second) return;

          const mid = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
          const distance = Math.hypot(second.x - first.x, second.y - first.y);
          const start = pinchStart.current;

          if (!start || start.distance <= 0) {
            pinchStart.current = { distance, pose: { ...pose.current }, mid };

            return;
          }

          const raw = start.pose.scale * (distance / start.distance);
          const ceiling = ceilingRef.current;
          const nextScale = springRef.current ? resistZoom(raw, ceiling) : clampZoom(raw, ceiling);

          const zoomedPose = zoomAt(start.pose, nextScale, start.mid, rect);

          const posed = {
            scale: zoomedPose.scale,
            x: zoomedPose.x + (mid.x - start.mid.x),
            y: zoomedPose.y + (mid.y - start.mid.y),
          };

          const now = performance.now();
          const previous = scaleSample.current;

          if (previous && now > previous.t) {
            scaleVelocity.current = ((nextScale - previous.scale) / (now - previous.t)) * 1000;
          }

          scaleSample.current = { scale: nextScale, t: now };

          apply(posed, false, !springRef.current);

          return;
        }

        const point = points[0];
        const pan = panStart.current;

        if (!point || !pan || pose.current.scale <= 1.02) return;

        apply(
          {
            scale: pan.pose.scale,
            x: pan.pose.x + (point.x - pan.pointer.x),
            y: pan.pose.y + (point.y - pan.pointer.y),
          },
          true,
        );
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      const layer = layerRef.current;

      // A slide without a zoom surface leaves its gestures to the track and the pull.
      if (!enabledRef.current || !layer) return;

      if (event.pointerType === "mouse" && event.button !== 0) return;

      pointerType.current = event.pointerType;

      // A primary pointer starts a new touch sequence. A pointer still listed from an
      // earlier one lost its release and would turn this pan into a pinch.
      if (event.isPrimary) pointers.current.clear();

      stopRef.current();

      // Catching the track mid-settle: the pan carries on from where it is.
      if (settleFrame.current !== 0) {
        cancelAnimationFrame(settleFrame.current);
        settleFrame.current = 0;
      }

      panSamples.current = [{ x: event.clientX, t: event.timeStamp }];

      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      moved.current = 0;
      measure(layer);

      if (pose.current.scale > 1.02) gestureRef.current = true;

      if (pointers.current.size >= 2) {
        // A pull, a hand-off or a moving track keeps the fingers. The pinch is asked
        // again on every move, so it can start once the track rests.
        if (claimPinch()) capturePointer(track, event.pointerId);

        schedule();

        return;
      }

      if (pose.current.scale > 1.02) {
        panStart.current = {
          pointer: { x: event.clientX, y: event.clientY },
          pose: { ...pose.current, x: panXRef.current() },
        };
        capturePointer(track, event.pointerId);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.current.get(event.pointerId);

      if (!previous) return;

      moved.current += Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const samples = panSamples.current;

      samples.push({ x: event.clientX, t: event.timeStamp });

      while (samples.length > 2 && event.timeStamp - (samples[0]?.t ?? 0) > VELOCITY_WINDOW_MS) {
        samples.shift();
      }

      if (pointers.current.size >= 2 || pose.current.scale > 1.02) schedule();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return;

      pointers.current.delete(event.pointerId);
      pinchStart.current = null;

      if (pointers.current.size < 2) releasePinch();

      if (pointers.current.size === 1 && pose.current.scale > 1.02) {
        const remaining = [...pointers.current.values()][0];

        if (remaining) {
          panStart.current = {
            pointer: remaining,
            pose: { ...pose.current, x: panXRef.current() },
          };
        }
      } else {
        panStart.current = null;
      }

      const tap =
        pointers.current.size === 0 && event.pointerType === "touch" && moved.current < TAP_SLOP;

      if (tap) {
        const now = event.timeStamp;
        const last = lastTap.current;

        const distance = last
          ? Math.hypot(event.clientX - last.x, event.clientY - last.y)
          : DOUBLE_TAP_DISTANCE;

        if (last && now - last.t < DOUBLE_TAP_MS && distance < DOUBLE_TAP_DISTANCE) {
          lastTap.current = null;

          const layer = layerRef.current;

          if (layer) {
            const rect = measure(layer);

            const target =
              pose.current.scale > 1.02
                ? { scale: 1, x: 0, y: 0 }
                : zoomAt(
                    pose.current,
                    Math.min(TAP_SCALE, ceilingRef.current),
                    { x: event.clientX, y: event.clientY },
                    rect,
                  );

            if (springRef.current && !reducedRef.current) animateRef.current(target, 0);
            else apply(target, false);
          }
        } else {
          lastTap.current = { t: now, x: event.clientX, y: event.clientY };
        }
      }

      if (pointers.current.size === 0) {
        if (handoffHome.current === null) gestureRef.current = false;

        const current = pose.current;
        const scale = clampZoom(current.scale, ceilingRef.current);

        if (
          springRef.current &&
          !reducedRef.current &&
          Math.abs(current.scale - scale) > 0.02 &&
          rectRef.current
        ) {
          const rect = rectRef.current;
          const maxX = Math.max(0, ((scale - 1) * rect.width) / 2);
          const maxY = Math.max(0, ((scale - 1) * rect.height) / 2);
          const distance = current.scale - scale;
          const rawVelocity = scaleVelocity.current / distance;

          const velocity = Number.isFinite(rawVelocity)
            ? Math.max(-12, Math.min(12, rawVelocity))
            : 0;

          animateRef.current(
            {
              scale,
              x: Math.min(maxX, Math.max(-maxX, current.x)),
              y: Math.min(maxY, Math.max(-maxY, current.y)),
            },
            velocity,
          );
        }

        if (handoffHome.current !== null) {
          // The release is a sample too, so a finger that stopped before lifting is not a flick.
          const samples = [...panSamples.current, { x: event.clientX, t: event.timeStamp }].filter(
            (sample) => event.timeStamp - sample.t <= VELOCITY_WINDOW_MS,
          );

          settleRef.current(horizontalSpeed(samples));
        }
      }
    };

    const onDoubleClick = (event: MouseEvent) => {
      if (!enabledRef.current || !layerRef.current) return;

      event.preventDefault();

      // Safari emits a compatibility dblclick after our touch pointerup handler.
      // It can arrive after the browser's tap delay. Touch owns that gesture;
      // the next mouse/pen pointerdown restores independent dblclick handling.
      if (pointerType.current === "touch") return;

      const layer = layerRef.current;

      if (!layer) return;

      stopRef.current();

      const rect = measure(layer);

      const target =
        pose.current.scale > 1.02
          ? { scale: 1, x: 0, y: 0 }
          : zoomAt(
              pose.current,
              Math.min(TAP_SCALE, ceilingRef.current),
              { x: event.clientX, y: event.clientY },
              rect,
            );

      if (springRef.current && !reducedRef.current) animateRef.current(target, 0);
      else apply(target, false);
    };

    const onWheel = (event: WheelEvent) => {
      // Checked before the layer lookup: most wheel events are swipes and pulls.
      if (!enabledRef.current || (!event.ctrlKey && pose.current.scale <= 1.02)) return;

      const layer = layerRef.current;

      if (!layer) return;

      // Before anything stops: a pinch ignored during a hand-off leaves it to settle.
      // The page zoom guard already cancels the browser's own zoom.
      if (event.ctrlKey && ownerRef.current("wheel-pinch") !== "zoom") return;

      event.preventDefault();
      stopRef.current();
      window.clearTimeout(wheelTimer.current);

      if (settleFrame.current !== 0) {
        cancelAnimationFrame(settleFrame.current);
        settleFrame.current = 0;
      }

      const rect = measure(layer);

      if (event.ctrlKey) {
        const nextScale = clampZoom(
          pose.current.scale * Math.exp(-event.deltaY * 0.002),
          ceilingRef.current,
        );

        apply(zoomAt(pose.current, nextScale, { x: event.clientX, y: event.clientY }, rect), false);

        return;
      }

      apply(
        {
          scale: pose.current.scale,
          x: panXRef.current() - event.deltaX,
          y: pose.current.y - event.deltaY,
        },
        true,
      );

      // A wheel has no release, so the hand-off settles once the wheel goes quiet.
      if (handoffHome.current !== null) {
        wheelTimer.current = window.setTimeout(() => {
          settleRef.current(0);
        }, HANDOFF_WHEEL_IDLE_MS);
      }
    };

    let gestureBase: number | null = null;

    const onGesture = (event: Event) => {
      // SAFETY: only registered for gesturestart/change/end, which WebKit dispatches as GestureEvent.
      const gesture = event as GestureEvent;

      // The page zoom guard cancels the default; touch pinch already runs on pointers.
      if (!enabledRef.current || pointers.current.size > 0) {
        gestureBase = null;

        return;
      }

      const layer = layerRef.current;

      if (!layer) return;

      if (ownerRef.current("wheel-pinch") !== "zoom") {
        gestureBase = null;

        return;
      }

      if (event.type === "gesturestart" || gestureBase === null) {
        stopRef.current();
        gestureBase = pose.current.scale;
      }

      if (event.type === "gestureend") {
        gestureBase = null;

        return;
      }

      const rect = measure(layer);
      apply(
        zoomAt(
          pose.current,
          clampZoom(gestureBase * gesture.scale, ceilingRef.current),
          { x: gesture.clientX, y: gesture.clientY },
          rect,
        ),
        false,
      );
    };

    const onResize = () => {
      const layer = layerRef.current;

      if (!layer || pose.current.scale <= 1.02) return;

      if (pointers.current.size > 0) {
        measure(layer);

        return;
      }

      stopRef.current();
      measure(layer);
      apply(pose.current, false);
    };

    track.addEventListener("pointerdown", onPointerDown);
    track.addEventListener("scroll", onTrackScroll, { passive: true });
    track.addEventListener("pointermove", onPointerMove);
    track.addEventListener("pointerup", onPointerUp);
    track.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    track.addEventListener("dblclick", onDoubleClick);
    track.addEventListener("wheel", onWheel, { passive: false });
    track.addEventListener("gesturestart", onGesture);
    track.addEventListener("gesturechange", onGesture);
    track.addEventListener("gestureend", onGesture);
    window.addEventListener("resize", onResize);

    return () => {
      track.removeEventListener("pointerdown", onPointerDown);
      track.removeEventListener("scroll", onTrackScroll);
      track.removeEventListener("pointermove", onPointerMove);
      track.removeEventListener("pointerup", onPointerUp);
      track.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      track.removeEventListener("dblclick", onDoubleClick);
      track.removeEventListener("wheel", onWheel);
      track.removeEventListener("gesturestart", onGesture);
      track.removeEventListener("gesturechange", onGesture);
      track.removeEventListener("gestureend", onGesture);
      window.removeEventListener("resize", onResize);

      if (frame.current !== 0) cancelAnimationFrame(frame.current);

      zoomAnim.current?.cancel();
      zoomAnim.current = null;
      pinching.current = false;
      endHandoff();
      gestureRef.current = false;
    };
  }, [apply, enabled, endHandoff, gestureRef, layerRef, measure, trackRef, zoomBy]);

  return { zoomed, zoomIn, zoomOut, reset, home };
}

function horizontalSpeed(samples: readonly { x: number; t: number }[]): number {
  const oldest = samples[0];
  const newest = samples[samples.length - 1];

  if (!oldest || !newest || newest.t <= oldest.t) return 0;

  return ((newest.x - oldest.x) / (newest.t - oldest.t)) * 1000;
}
