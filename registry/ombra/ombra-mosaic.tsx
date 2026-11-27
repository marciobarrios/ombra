"use client";

// A justified mosaic layout for `OmbraGallery`: rows of equal height that fill the width, each
// photo in its own frame, in reading order. Plain CSS flexbox, so it reflows at any width.

import { cn } from "cn";

import { frameRatio } from "./gallery-layout";
import { OmbraGalleryTile, useOmbraGalleryItems } from "./ombra-gallery";

export type OmbraMosaicProps = {
  /** Set `--ombra-row-height` here to change the target row height. */
  className?: string;
};

export function OmbraMosaic({ className }: OmbraMosaicProps) {
  const items = useOmbraGalleryItems();

  return (
    <div
      data-slot="ombra-mosaic"
      className={cn(
        // Each tile grows in proportion to its width over height, so every tile in a row
        // stretches to the same height. The trailing spacer takes the last row's spare width,
        // so that row keeps the target height instead of stretching.
        "flex flex-wrap items-start gap-2 [--ombra-row-height:8rem] after:grow-[1000] after:content-[''] md:[--ombra-row-height:12rem]",
        className,
      )}
    >
      {items.map((item) => {
        const ratio = frameRatio(item.frame);

        return (
          <OmbraGalleryTile
            key={item.id}
            item={item}
            sizes="(min-width: 768px) 40vw, 70vw"
            // A row of one wide photo on a narrow screen would stretch far past the target
            // height. The cap crops it instead: the thumbnail is a cover crop anyway.
            className="max-h-[calc(var(--ombra-row-height)*1.5)]"
            style={{
              aspectRatio: item.frame,
              flexGrow: ratio,
              flexBasis: `calc(${ratio} * var(--ombra-row-height))`,
            }}
          />
        );
      })}
    </div>
  );
}
