/**
 * Ceilings the performance checks enforce. The pre-spike proposal was 12 KB gzipped.
 * The gallery and album recipes, including zoom and excluding React, Base UI, and `cn`,
 * measured 26,252 bytes when the first 27 KB ceiling was set. At 27,570 bytes, with captions
 * in, the ceiling moved to 32 KB to leave room for the v0.1 and v1 features that land in the
 * gallery bundle, so the size check fails above 32 KB. Zoom and track arbitration (MAR-22)
 * added 571 bytes. The thumbnail strip's landmark and one-photo rule (MAR-18) added 56,
 * and the natural-size zoom ceiling (MAR-21) 298. `OmbraTitle` saved 6.
 */
export const CORE_GZIP_LIMIT_BYTES = 32 * 1024;

/** Current gzip size of that bundle. Update it, and the reports that quote it, with the core. */
export const CORE_GZIP_MEASURED_BYTES = 28_865;

/**
 * Longest frame the Chromium check allows. Chromium's long-animation-frame entries
 * start at 50 ms, and a CI runner is not a phone. The iPhone bar stays 33 ms.
 */
export const CHROMIUM_FRAME_CEILING_MS = 50;

/** Open, close, and navigation. Matches the proposed interaction budget. */
export const INP_LIMIT_MS = 200;

/** Longest frame during morph, pull, pinch, and pan on an iPhone. */
export const IPHONE_FRAME_LIMIT_MS = 33;

/** WAAPI keyframe names the Chromium check allows. `borderRadius` is the corner and pull-snap exception. */
export const ANIMATED_PROPERTY_NAMES = [
  "--ombra-pull-live",
  "borderRadius",
  "clipPath",
  "opacity",
  "transform",
] as const;
