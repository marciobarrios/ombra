"use client";

// A bento layout for `OmbraGallery`: one large photo and smaller ones around it, with a "+N"
// tile when the photos outnumber the tiles. Copy it and edit the templates to change the shape.

import { cn } from "cn";

import { bentoLayout, overflowIndex } from "./gallery-layout";
import { OmbraGalleryTile, useOmbraGalleryItems } from "./ombra-gallery";
import { useOmbraState } from "./ombra-root";

export type OmbraBentoProps = {
  /** The most tiles to show, the overflow tile included: 1 to 5. Defaults to 5. */
  max?: number;
  /** The overflow tile's accessible name. Defaults to "N more photos". */
  overflowLabel?: (hidden: number) => string;
  className?: string;
};

// One template per tile count. Tile n takes the nth area letter, so a replacement template
// names its areas a, b, c, d and e.
const AREAS = ["a", "b", "c", "d", "e"] as const;

const TEMPLATES = [
  "",
  "grid-cols-1 grid-rows-1 [grid-template-areas:'a']",
  "grid-cols-2 grid-rows-1 [grid-template-areas:'a_b']",
  "grid-cols-[2fr_1fr] grid-rows-2 [grid-template-areas:'a_b'_'a_c']",
  "grid-cols-3 grid-rows-[2fr_1fr] [grid-template-areas:'a_a_a'_'b_c_d']",
  "grid-cols-6 grid-rows-[3fr_2fr] [grid-template-areas:'a_a_a_b_b_b'_'c_c_d_d_e_e']",
] as const;

function morePhotos(hidden: number): string {
  return `${hidden} more photos`;
}

export function OmbraBento({ max = 5, overflowLabel = morePhotos, className }: OmbraBentoProps) {
  const items = useOmbraGalleryItems();
  const { phase, index } = useOmbraState();
  const { tiles, regular, hidden } = bentoLayout(items.length, max);

  if (tiles === 0) return null;

  const openIndex = phase === "closed" ? -1 : index;
  const overflow = hidden > 0 ? items[overflowIndex(openIndex, regular, items.length)] : undefined;

  return (
    <div
      data-slot="ombra-bento"
      data-tiles={tiles}
      className={cn("grid aspect-[4/3] gap-1.5 md:aspect-[16/9]", TEMPLATES[tiles], className)}
    >
      {items.slice(0, regular).map((item, position) => (
        <OmbraGalleryTile
          key={item.id}
          item={item}
          sizes={
            position === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"
          }
          style={{ gridArea: AREAS[position] }}
        />
      ))}
      {overflow && (
        <OmbraGalleryTile
          key="overflow"
          item={overflow}
          sizes="(min-width: 768px) 25vw, 50vw"
          aria-label={overflowLabel(hidden)}
          data-overflow=""
          style={{ gridArea: AREAS[tiles - 1] }}
        >
          {/* Hidden while the viewer is open, so the close lands on the bare photo and the
              count fades back in after it. */}
          <span
            aria-hidden="true"
            data-slot="ombra-bento-count"
            className={cn(
              "absolute inset-0 grid place-items-center rounded-[inherit] bg-black/50 text-2xl font-medium text-white tabular-nums transition-opacity duration-200 motion-reduce:transition-none",
              phase !== "closed" && "opacity-0",
            )}
          >
            +{hidden}
          </span>
        </OmbraGalleryTile>
      )}
    </div>
  );
}
