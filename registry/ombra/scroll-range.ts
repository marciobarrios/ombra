/**
 * The `scrollLeft` range of a horizontal scroller. Left to right it runs from 0 up; right to
 * left it starts at 0 on the right edge and runs negative, so a clamp to `[0, max]` would pin
 * an RTL track to its first slide.
 */
export function scrollLeftRange(
  scrollWidth: number,
  clientWidth: number,
  rtl: boolean,
): { min: number; max: number } {
  const extent = Math.max(0, scrollWidth - clientWidth);

  return rtl ? { min: -extent, max: 0 } : { min: 0, max: extent };
}

/** Clamps a `scrollLeft` value to what the scroller can reach, in either direction. */
export function clampScrollLeft(element: HTMLElement, left: number): number {
  const rtl = getComputedStyle(element).direction === "rtl";
  const { min, max } = scrollLeftRange(element.scrollWidth, element.clientWidth, rtl);

  return Math.min(max, Math.max(min, left));
}
