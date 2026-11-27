// Layout decisions for the gallery's bento and mosaic layouts, kept free of React and the
// DOM so a unit spec covers every case.

/** The most tiles a bento shows, the overflow tile included. */
export const BENTO_MAX_TILES = 5;

export type BentoLayout = {
  /** Tiles on screen, the overflow tile included: 1 to `BENTO_MAX_TILES`, or 0 for no items. */
  tiles: number;
  /** Tiles that show one photo each, in order from the first item. */
  regular: number;
  /** Photos behind the overflow tile, the one it shows included. 0 when every photo has a tile. */
  hidden: number;
};

/**
 * How a bento splits `count` photos: every photo gets a tile while they fit in `max`. Past
 * that, the last tile becomes the overflow tile. It shows the first photo without a tile of
 * its own and counts it with the rest, so 6 photos in 5 tiles read "+2".
 */
export function bentoLayout(count: number, max: number = BENTO_MAX_TILES): BentoLayout {
  const items = Math.max(0, Math.floor(count));
  const limit = Math.min(BENTO_MAX_TILES, Math.max(1, Math.floor(max) || 1));
  const tiles = Math.min(items, limit);

  if (items <= limit) return { tiles, regular: tiles, hidden: 0 };

  return { tiles, regular: tiles - 1, hidden: items - (tiles - 1) };
}

/**
 * The photo the overflow tile shows and opens: the first hidden photo. While the viewer is
 * open on a hidden photo, the tile takes that photo, so the close lands on the tile with the
 * same image (a close never morphs onto a different photo). Pass -1 once the viewer has closed,
 * so the tile goes back to the first hidden photo.
 */
export function overflowIndex(openIndex: number, firstHidden: number, count: number): number {
  return openIndex >= firstHidden && openIndex < count ? openIndex : firstHidden;
}

/** Width over height of a CSS aspect-ratio value such as "3 / 2" or "1.5". 1 when unreadable. */
export function frameRatio(frame: string): number {
  const [width, height = "1"] = frame.split("/");
  const ratio = Number(width) / Number(height);

  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}
