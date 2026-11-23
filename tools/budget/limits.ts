/**
 * Ceilings the performance checks enforce. The pre-spike proposal was 12 KB gzipped.
 * The gallery and album recipes, including zoom and excluding React, Base UI, and `cn`,
 * measured 26,252 bytes when this ceiling was set, so the size check fails above 27 KB.
 */
export const CORE_GZIP_LIMIT_BYTES = 27 * 1024;

/** Current gzip size of that bundle. Update it, and the reports that quote it, with the core. */
export const CORE_GZIP_MEASURED_BYTES = 27_034;

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
