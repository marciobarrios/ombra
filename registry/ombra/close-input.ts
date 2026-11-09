const TAP_SLOP_PX = 10;
const REVERSE_PX = 12;
const VELOCITY_WINDOW_MS = 130;
const CLICK_SWALLOW_MS = 300;

type Sample = {
  y: number;
  t: number;
};

export type CloseInputHandlers = {
  /** Receives the upward speed. Returns false if the close cannot reverse yet. */
  onReverse: (pixelsPerSecond: number) => boolean;
  /** Returns true if the tap landed on something that interrupts the close. */
  onTap: (x: number, y: number) => boolean;
};

/**
 * The input route while a close is running. The popup ignores pointers and a
 * view transition sends every hit to the root, so nothing inside the viewer can
 * see a gesture. Window capture sees it for both engines, and for the same reason
 * callers must hit-test by geometry rather than by event target.
 *
 * Returns a stop function. A gesture that already reversed the close stays
 * tracked until the finger lifts: its touchmove must not start a page scroll, and
 * its click must not reach the reopened dialog as an outside press.
 */
export function listenForCloseInput({ onReverse, onTap }: CloseInputHandlers): () => void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let moved = false;
  let handled = false;
  let stopped = false;
  const samples: Sample[] = [];

  const onPointerDown = (event: PointerEvent) => {
    if (stopped || pointerId !== null) return;

    if (event.pointerType === "mouse" && event.button !== 0) return;

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    moved = false;
    samples.length = 0;
    samples.push({ y: event.clientY, t: event.timeStamp });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId || handled) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (Math.hypot(dx, dy) > TAP_SLOP_PX) moved = true;

    samples.push({ y: event.clientY, t: event.timeStamp });

    while (samples[0] && event.timeStamp - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();

    if (dy > -REVERSE_PX || Math.abs(dy) <= Math.abs(dx)) return;

    handled = onReverse(upwardSpeed(samples));
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;

    if (!handled && !moved) handled = onTap(event.clientX, event.clientY);

    pointerId = null;

    if (handled) swallowNextClick();

    if (stopped) removeListeners();
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;

    pointerId = null;

    if (stopped) removeListeners();
  };

  // Pointer events end in pointercancel as soon as the browser claims a pan, and
  // touch-action cannot help because the touch can start on any element.
  const onTouchMove = (event: TouchEvent) => {
    if (pointerId !== null && event.cancelable) event.preventDefault();
  };

  // A mouse press would otherwise blur the dialog that is about to come back.
  const onMouseDown = (event: MouseEvent) => {
    event.preventDefault();
  };

  const removeListeners = () => {
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerCancel, true);
    window.removeEventListener("touchmove", onTouchMove, true);
    window.removeEventListener("mousedown", onMouseDown, true);
  };

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerCancel, true);
  window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
  window.addEventListener("mousedown", onMouseDown, true);

  return () => {
    stopped = true;

    if (pointerId === null || !handled) removeListeners();
  };
}

function upwardSpeed(samples: readonly Sample[]): number {
  const oldest = samples[0];
  const newest = samples[samples.length - 1];

  if (!oldest || !newest || newest.t <= oldest.t) return 0;

  return Math.max(0, ((oldest.y - newest.y) / (newest.t - oldest.t)) * 1000);
}

function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  window.addEventListener("click", swallow, { capture: true, once: true });
  window.setTimeout(() => {
    window.removeEventListener("click", swallow, true);
  }, CLICK_SWALLOW_MS);
}
