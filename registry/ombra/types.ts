export const MORPH_ENGINES = ["vt", "flip", "fade"] as const;

export type MorphEngine = (typeof MORPH_ENGINES)[number];

/** The gallery recipe's photo shape. The root needs only the IDs. */
export type OmbraGalleryItem = {
  id: string;
  alt: string;
  caption: string;
  /** Intrinsic width. With `height`, it reserves the photo's box before the file loads. */
  width?: number;
  /** Intrinsic height. Without both, the viewer measures the photo once it loads. */
  height?: number;
  /** CSS aspect-ratio for the cover-cropped thumbnail, such as "3 / 4". */
  frame: string;
  src: string;
  thumbSrc: string;
  srcSet: string;
};

export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Crop = {
  inline: number;
  block: number;
};

export type FlipPose = {
  transform: string;
  clipPath: string;
};

export type FrameSample = {
  longestMs: number;
  dropped: number;
  frames: number;
  /** Median frame delta: the display's effective refresh interval during the sample. */
  intervalMs: number;
  /** 1-based positions of the dropped frames among `frames - 1` measured frames. */
  droppedAt: number[];
  /** Drops other than the first and last frame: start-up and settle cost sit at the ends, jank in between. */
  midDropped: number;
  /** Raw frame times, so a caller can score the run again against another baseline. */
  deltas: number[];
};

export type MorphKind = "open" | "close";

export function parseMorphEngine(value: string | null | undefined): MorphEngine {
  if (value === "vt" || value === "flip" || value === "fade") return value;

  return "flip";
}

export function motionDuration(baseMs: number, slow: boolean, reduced: boolean): number {
  if (reduced) return 0;

  if (slow) return baseMs * 3;

  return baseMs;
}
