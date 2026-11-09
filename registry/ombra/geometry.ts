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

export function boxContains(box: Box, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

export function mostlyVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) return false;

  const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
  const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);

  return visibleWidth >= rect.width * 0.55 && visibleHeight >= rect.height * 0.55;
}

export function revealElement(element: HTMLElement): "ready" | "hidden" {
  if (mostlyVisible(element)) return "ready";

  element.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });

  if (mostlyVisible(element)) return "ready";

  const rect = element.getBoundingClientRect();
  const delta = rect.top + rect.height / 2 - window.innerHeight / 2;

  window.scrollBy({ top: delta, left: 0, behavior: "auto" });

  if (mostlyVisible(element)) return "ready";

  return "hidden";
}

export function indexFromScroll(track: HTMLElement): number {
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

  return best;
}
