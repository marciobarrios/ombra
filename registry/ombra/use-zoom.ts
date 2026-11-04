"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

type Pose = {
  scale: number;
  x: number;
  y: number;
};

type Point = {
  x: number;
  y: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_DISTANCE = 28;
const TAP_SLOP = 12;

export type ZoomControls = {
  zoomed: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
};

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
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

function clearLayers(track: HTMLElement | null) {
  if (!track) return;

  const layers = track.querySelectorAll<HTMLElement>("[data-slot=ombra-zoom]");

  for (const layer of layers) {
    layer.style.transform = "";
    delete layer.dataset.zoomed;
  }
}

export function useZoom(
  trackRef: RefObject<HTMLElement | null>,
  layerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  onSettled: () => void,
): ZoomControls {
  const pose = useRef<Pose>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const rectRef = useRef<DOMRect | null>(null);
  const pinchStart = useRef<{ distance: number; pose: Pose; mid: Point } | null>(null);
  const panStart = useRef<{ pointer: Point; pose: Pose } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const moved = useRef(0);
  const handedOff = useRef(false);
  const frame = useRef(0);
  const enabledRef = useRef(enabled);
  const onSettledRef = useRef(onSettled);
  const [zoomed, setZoomed] = useState(false);
  const zoomedRef = useRef(false);

  enabledRef.current = enabled;
  onSettledRef.current = onSettled;

  const apply = useCallback(
    (next: Pose, allowHandoff: boolean) => {
      const layer = layerRef.current;
      const rect = rectRef.current;

      if (!layer || !rect || rect.width <= 0 || rect.height <= 0) return;

      const scale = clampScale(next.scale);
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

      const nowZoomed = scale > 1.02;

      layer.dataset.zoomed = nowZoomed ? "true" : "false";

      const track = trackRef.current;

      if (track) {
        track.style.overflowX = nowZoomed ? "hidden" : "";
        track.style.touchAction = nowZoomed ? "none" : "";
      }

      if (nowZoomed !== zoomedRef.current) {
        zoomedRef.current = nowZoomed;
        setZoomed(nowZoomed);
      }

      if (allowHandoff && overflow !== 0 && track) {
        handedOff.current = true;
        track.style.overflowX = "auto";
        track.scrollLeft -= overflow;
        track.style.overflowX = "hidden";
      }
    },
    [layerRef, trackRef],
  );

  const reset = useCallback(() => {
    pose.current = { scale: 1, x: 0, y: 0 };
    pinchStart.current = null;
    panStart.current = null;
    handedOff.current = false;
    zoomedRef.current = false;
    setZoomed(false);
    clearLayers(trackRef.current);

    const track = trackRef.current;

    if (track) {
      track.style.overflowX = "";
      track.style.touchAction = "";
    }
  }, [trackRef]);

  const zoomBy = useCallback(
    (factor: number, origin?: Point) => {
      const layer = layerRef.current;

      if (!layer || !enabledRef.current) return;

      const rect = layer.getBoundingClientRect();

      rectRef.current = rect;

      const point = origin ?? {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      const nextScale = clampScale(pose.current.scale * factor);

      apply(zoomAt(pose.current, nextScale, point, rect), false);
    },
    [apply, layerRef],
  );

  const zoomIn = useCallback(() => {
    zoomBy(1.25);
  }, [zoomBy]);

  const zoomOut = useCallback(() => {
    zoomBy(1 / 1.25);
  }, [zoomBy]);

  useEffect(() => {
    if (enabled) return;

    reset();
  }, [enabled, reset]);

  useEffect(() => {
    const track = trackRef.current;

    if (!track || !enabled) return;

    const schedule = () => {
      if (frame.current !== 0) return;

      frame.current = requestAnimationFrame(() => {
        frame.current = 0;

        const rect = rectRef.current;
        const points = [...pointers.current.values()];

        if (!rect || points.length === 0) return;

        if (points.length >= 2) {
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

          const nextScale = clampScale(start.pose.scale * (distance / start.distance));
          const zoomedPose = zoomAt(start.pose, nextScale, start.mid, rect);

          apply(
            {
              scale: zoomedPose.scale,
              x: zoomedPose.x + (mid.x - start.mid.x),
              y: zoomedPose.y + (mid.y - start.mid.y),
            },
            false,
          );

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
      if (!enabledRef.current) return;

      if (event.pointerType === "mouse" && event.button !== 0) return;

      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      moved.current = 0;

      const layer = layerRef.current;

      if (layer) rectRef.current = layer.getBoundingClientRect();

      if (pointers.current.size >= 2) {
        pinchStart.current = null;
        panStart.current = null;
        track.setPointerCapture(event.pointerId);
        schedule();

        return;
      }

      if (pose.current.scale > 1.02) {
        panStart.current = {
          pointer: { x: event.clientX, y: event.clientY },
          pose: { ...pose.current },
        };
        track.setPointerCapture(event.pointerId);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.current.get(event.pointerId);

      if (!previous) return;

      moved.current += Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.current.size >= 2 || pose.current.scale > 1.02) schedule();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return;

      pointers.current.delete(event.pointerId);
      pinchStart.current = null;

      if (pointers.current.size === 1 && pose.current.scale > 1.02) {
        const remaining = [...pointers.current.values()][0];

        if (remaining) {
          panStart.current = { pointer: remaining, pose: { ...pose.current } };
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
            const rect = layer.getBoundingClientRect();

            rectRef.current = rect;

            if (pose.current.scale > 1.02) {
              apply({ scale: 1, x: 0, y: 0 }, false);
            } else {
              apply(
                zoomAt(pose.current, TAP_SCALE, { x: event.clientX, y: event.clientY }, rect),
                false,
              );
            }
          }
        } else {
          lastTap.current = { t: now, x: event.clientX, y: event.clientY };
        }
      }

      if (pointers.current.size === 0 && handedOff.current) {
        handedOff.current = false;
        onSettledRef.current();
      }
    };

    const onDoubleClick = (event: MouseEvent) => {
      if (!enabledRef.current) return;

      event.preventDefault();

      const layer = layerRef.current;

      if (!layer) return;

      const rect = layer.getBoundingClientRect();

      rectRef.current = rect;

      if (pose.current.scale > 1.02) {
        apply({ scale: 1, x: 0, y: 0 }, false);

        return;
      }

      apply(zoomAt(pose.current, TAP_SCALE, { x: event.clientX, y: event.clientY }, rect), false);
    };

    const onWheel = (event: WheelEvent) => {
      if (!enabledRef.current) return;

      const layer = layerRef.current;

      if (!layer) return;

      if (!event.ctrlKey && pose.current.scale <= 1.02) return;

      event.preventDefault();

      const rect = layer.getBoundingClientRect();

      rectRef.current = rect;

      if (event.ctrlKey) {
        const nextScale = clampScale(pose.current.scale * Math.exp(-event.deltaY * 0.002));

        apply(zoomAt(pose.current, nextScale, { x: event.clientX, y: event.clientY }, rect), false);

        return;
      }

      apply(
        {
          scale: pose.current.scale,
          x: pose.current.x - event.deltaX,
          y: pose.current.y - event.deltaY,
        },
        true,
      );
    };

    track.addEventListener("pointerdown", onPointerDown);
    track.addEventListener("pointermove", onPointerMove);
    track.addEventListener("pointerup", onPointerUp);
    track.addEventListener("pointercancel", onPointerUp);
    track.addEventListener("dblclick", onDoubleClick);
    track.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      track.removeEventListener("pointerdown", onPointerDown);
      track.removeEventListener("pointermove", onPointerMove);
      track.removeEventListener("pointerup", onPointerUp);
      track.removeEventListener("pointercancel", onPointerUp);
      track.removeEventListener("dblclick", onDoubleClick);
      track.removeEventListener("wheel", onWheel);

      if (frame.current !== 0) cancelAnimationFrame(frame.current);
    };
  }, [apply, enabled, layerRef, trackRef, zoomBy]);

  return { zoomed, zoomIn, zoomOut, reset };
}
