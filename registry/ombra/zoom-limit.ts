/** The zoom ceiling when the media's natural or fitted width is unknown. */
export const FALLBACK_ZOOM_CEILING = 4;

/**
 * The largest scale a zoom may reach: the media at its natural width, so a zoom never
 * magnifies past the file's own pixels. A consumer's `hint` replaces that limit. Never below 1,
 * so media that already shows at or above its natural size does not zoom without a hint.
 */
export function zoomCeiling(naturalWidth: number, fittedWidth: number, hint?: number): number {
  if (hint !== undefined && Number.isFinite(hint) && hint > 0) return Math.max(1, hint);

  if (!(naturalWidth > 0) || !(fittedWidth > 0)) return FALLBACK_ZOOM_CEILING;

  return Math.max(1, naturalWidth / fittedWidth);
}

/** Keeps a resting scale between 1 and the ceiling. */
export function clampZoom(scale: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(1, scale));
}

/** Lets a pinch pass either limit with resistance, so the spring can bring it back. */
export function resistZoom(scale: number, ceiling: number): number {
  if (scale > ceiling) return ceiling + (scale - ceiling) * 0.28;

  if (scale < 1) return 1 - (1 - scale) * 0.28;

  return scale;
}
