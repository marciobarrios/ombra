import type { Box, Crop, FlipPose } from "./types";

export function boxFromRect(rect: Pick<DOMRect, "x" | "y" | "width" | "height">): Box {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function containBox(frame: Box, aspect: number): Box {
  if (frame.width <= 0 || frame.height <= 0 || aspect <= 0) return frame;

  const frameAspect = frame.width / frame.height;

  if (aspect > frameAspect) {
    const width = frame.width;
    const height = width / aspect;

    return {
      x: frame.x,
      y: frame.y + (frame.height - height) / 2,
      width,
      height,
    };
  }

  const height = frame.height;
  const width = height * aspect;

  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y,
    width,
    height,
  };
}

/** Fractional inset that reproduces object-fit: cover for a known frame. */
export function coverCrop(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
): Crop {
  if (imageWidth <= 0 || imageHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) {
    return { inline: 0, block: 0 };
  }

  const imageAspect = imageWidth / imageHeight;
  const frameAspect = frameWidth / frameHeight;

  if (imageAspect > frameAspect) {
    const visible = frameAspect / imageAspect;

    return { inline: (1 - visible) / 2, block: 0 };
  }

  const visible = imageAspect / frameAspect;

  return { inline: 0, block: (1 - visible) / 2 };
}

export function clipInset(crop: Crop, radius = 6): string {
  const inline = `${crop.inline * 100}%`;
  const block = `${crop.block * 100}%`;

  return `inset(${block} ${inline} ${block} ${inline} round ${radius}px)`;
}

export const RESTING_POSE: FlipPose = {
  transform: "translate(0px, 0px) scale(1)",
  clipPath: clipInset({ inline: 0, block: 0 }),
};

/**
 * Pose that places the visible (cropped) region of a home-sized image onto `target`.
 * `home` is the untransformed fixed box of the full image.
 */
export function poseBetween(target: Box, home: Box, crop: Crop): FlipPose {
  const visibleWidth = home.width * (1 - crop.inline * 2);

  if (visibleWidth <= 0 || home.height <= 0 || target.width <= 0) return RESTING_POSE;

  const scale = target.width / visibleWidth;
  const dx = target.x + target.width / 2 - (home.x + home.width / 2);
  const dy = target.y + target.height / 2 - (home.y + home.height / 2);

  return {
    transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
    // Keep the visible corner at 6px after the flight's scale is applied.
    clipPath: clipInset(crop, 6 / scale),
  };
}

/** The full image box whose cover crop is `box`, centered on it. */
export function uncropBox(box: Box, crop: Crop): Box {
  const width = box.width / (1 - crop.inline * 2);
  const height = box.height / (1 - crop.block * 2);

  return {
    x: box.x - (width - box.width) / 2,
    y: box.y - (height - box.height) / 2,
    width,
    height,
  };
}

/** The largest difference in center, width, or height between two boxes. */
export function boxDistance(a: Box, b: Box): number {
  const dx = a.x + a.width / 2 - (b.x + b.width / 2);
  const dy = a.y + a.height / 2 - (b.y + b.height / 2);

  return Math.max(Math.hypot(dx, dy), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
}

export function boxContains(box: Box, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

/** Whether an element is in the document and laid out, so it has a box to morph to. */
export function isRendered(element: HTMLElement | null | undefined): element is HTMLElement {
  return Boolean(element?.isConnected && element.getClientRects().length > 0);
}

function clipsOverflow(style: CSSStyleDeclaration): boolean {
  return style.overflowX !== "visible" || style.overflowY !== "visible";
}

/**
 * The part of an element's box that is not clipped by an ancestor with overflow
 * other than visible, and, when `viewport` is set, by the layout viewport.
 */
function unclippedBox(element: HTMLElement, viewport: boolean): Box | null {
  const rect = element.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top;
  let right = rect.right;
  let bottom = rect.bottom;

  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent === document.body || parent === document.documentElement) break;

    const style = getComputedStyle(parent);

    if (clipsOverflow(style)) {
      const clip = parent.getBoundingClientRect();

      left = Math.max(left, clip.left);
      top = Math.max(top, clip.top);
      right = Math.min(right, clip.right);
      bottom = Math.min(bottom, clip.bottom);
    }

    // Ancestors of a fixed box do not clip it.
    if (style.position === "fixed") break;
  }

  if (viewport) {
    left = Math.max(left, 0);
    top = Math.max(top, 0);
    right = Math.min(right, window.innerWidth);
    bottom = Math.min(bottom, window.innerHeight);
  }

  if (right <= left || bottom <= top) return null;

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function mostlyShown(element: HTMLElement, viewport: boolean): boolean {
  if (!isRendered(element)) return false;

  const rect = element.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) return false;

  const visible = unclippedBox(element, viewport);

  if (!visible) return false;

  return visible.width >= rect.width * 0.55 && visible.height >= rect.height * 0.55;
}

/** At least 55% of each side is on screen and not clipped by a scroll container. */
export function mostlyVisible(element: HTMLElement): boolean {
  return mostlyShown(element, true);
}

/**
 * At least 55% of each side is not clipped by a scroll container. The viewport
 * does not count: a photo opening from a thumbnail half off screen still flies
 * from the right place, but one cut by a carousel's edge would show its hidden part.
 */
export function mostlyUnclipped(element: HTMLElement): boolean {
  return mostlyShown(element, false);
}

export function revealElement(element: HTMLElement): "ready" | "hidden" {
  // Scrolling towards an element with no box would move the page for nothing.
  if (!isRendered(element)) return "hidden";

  if (mostlyVisible(element)) return "ready";

  element.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });

  if (mostlyVisible(element)) return "ready";

  const rect = element.getBoundingClientRect();
  const delta = rect.top + rect.height / 2 - window.innerHeight / 2;

  window.scrollBy({ top: delta, left: 0, behavior: "auto" });

  if (mostlyVisible(element)) return "ready";

  return "hidden";
}

type NearestSlide = {
  index: number;
  /** Pixels between the slide's centre and the track's. Infinite with no slides. */
  distance: number;
};

/** The slide nearest the track's centre, and how far its centre is from it. */
function nearestSlide(track: HTMLElement): NearestSlide {
  const slides = track.querySelectorAll<HTMLElement>("[data-slot=ombra-slide]");
  const trackRect = track.getBoundingClientRect();
  const midpoint = trackRect.left + trackRect.width / 2;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index];

    if (!slide) continue;

    const rect = slide.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const distance = Math.abs(center - midpoint);

    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }

  return { index: best, distance: bestDistance };
}

export function indexFromScroll(track: HTMLElement): number {
  return nearestSlide(track).index;
}

/**
 * Whether a slide sits in the track's centre. A finger that catches a fling holds the
 * track between two slides with no scroll events, so a quiet track is not enough.
 */
export function restsOnSlide(track: HTMLElement, tolerance = 2): boolean {
  const { distance } = nearestSlide(track);

  return !Number.isFinite(distance) || distance <= tolerance;
}
