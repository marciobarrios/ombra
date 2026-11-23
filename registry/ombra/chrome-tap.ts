"use client";

import { DOUBLE_TAP_DISTANCE, DOUBLE_TAP_MS, TAP_SLOP } from "./use-zoom";

export type ChromeVisibility = "shown" | "hidden";

export type ChromeAction = { type: "chrome-toggled" } | { type: "chrome-reset" };

/** A tap hides the controls; the next open shows them again. */
export function chromeReducer(state: ChromeVisibility, action: ChromeAction): ChromeVisibility {
  switch (action.type) {
    case "chrome-toggled":
      return state === "shown" ? "hidden" : "shown";
    case "chrome-reset":
      return state === "shown" ? state : "shown";
  }
}

type Press = { id: number; x: number; y: number };

// A tap on the controls themselves, or on something the consumer meant to activate.
const KEEPS_CHROME = [
  "[data-slot=ombra-chrome]",
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "label",
  "summary",
  "[role=button]",
  "[role=link]",
  "[contenteditable]:not([contenteditable=false])",
].join(",");

function keepsChrome(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(KEEPS_CHROME) !== null;
}

/**
 * Hides and shows the controls on a tap on the photo. A second tap inside the zoom
 * double-tap window belongs to the zoom, so it does not also toggle the chrome. The
 * listener waits that window out before toggling, and a drag past the tap slop never
 * counts. `allow` is false while the viewer is opening or closing.
 */
export function attachChromeTap(
  popup: HTMLElement,
  onToggle: () => void,
  allow: () => boolean,
): () => void {
  const pointers = new Set<number>();
  let origin: Press | null = null;
  let lastTap: { t: number; x: number; y: number } | null = null;
  let timer = 0;

  const clearTimer = () => {
    window.clearTimeout(timer);
    timer = 0;
  };

  const onPointerDown = (event: PointerEvent) => {
    pointers.add(event.pointerId);
    // A second press is a double-tap or a pinch, so the pending hide must not win.
    clearTimer();

    if (!allow() || event.button !== 0 || pointers.size > 1 || keepsChrome(event.target)) {
      origin = null;

      return;
    }

    origin = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!origin || event.pointerId !== origin.id) return;

    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > TAP_SLOP) origin = null;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;

    if (pointers.size > 0) {
      origin = null;

      return;
    }

    if (!origin || event.pointerId !== origin.id) return;

    const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
    const point = { x: event.clientX, y: event.clientY };

    origin = null;

    if (distance > TAP_SLOP || keepsChrome(event.target) || !allow()) return;

    const previous = lastTap;

    if (
      previous &&
      event.timeStamp - previous.t < DOUBLE_TAP_MS &&
      Math.hypot(point.x - previous.x, point.y - previous.y) < DOUBLE_TAP_DISTANCE
    ) {
      lastTap = null;

      return;
    }

    lastTap = { t: event.timeStamp, ...point };
    timer = window.setTimeout(() => {
      timer = 0;
      lastTap = null;

      if (allow()) onToggle();
    }, DOUBLE_TAP_MS);
  };

  const onPointerCancel = (event: PointerEvent) => {
    pointers.delete(event.pointerId);

    if (origin?.id === event.pointerId) origin = null;
  };

  popup.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);

  return () => {
    clearTimer();
    popup.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
  };
}
