"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { OmbraCaption } from "@/components/ombra/ombra-caption";
import { OmbraCounter, OmbraNext, OmbraPrevious } from "@/components/ombra/ombra-controls";
import {
  OmbraBackdrop,
  OmbraChrome,
  OmbraClose,
  OmbraContent,
  OmbraPortal,
  OmbraTitle,
} from "@/components/ombra/ombra-dialog";
import { OmbraRoot, useOmbraState } from "@/components/ombra/ombra-root";
import { OmbraMedia, OmbraSlide, OmbraSlides } from "@/components/ombra/ombra-slides";
import { OmbraTrigger } from "@/components/ombra/ombra-trigger";

import { photos } from "./photos";
import type { Photo } from "./photos";

const title = "Four landscapes";

/**
 * A `<picture>` lays out as its image, so the media part sizes the image itself. Put a
 * modern format, such as AVIF, in a `<source>` above the JPEG set when you have one.
 */
function Picture({ photo, sizes, className }: { photo: Photo; sizes: string; className: string }) {
  return (
    <picture className="contents">
      <source type="image/jpeg" srcSet={photo.srcSet} sizes={sizes} />
      <img
        src={photo.src}
        alt=""
        width={photo.width}
        height={photo.height}
        draggable={false}
        className={className}
      />
    </picture>
  );
}

export function Album() {
  const cover = photos[0];

  if (!cover) return null;

  return (
    <OmbraRoot itemIds={photos.map((photo) => photo.id)}>
      {/* One trigger for the whole album: the cover opens on the first photo. */}
      <OmbraTrigger
        itemId={cover.id}
        aria-label={`${title}, ${photos.length} photos`}
        className="relative block aspect-[4/3] w-full max-w-md overflow-hidden rounded-md text-left"
      >
        <Picture
          photo={cover}
          sizes="(min-width: 768px) 28rem, 100vw"
          className="size-full object-cover"
        />
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-linear-to-t from-black/60 to-transparent p-3 pt-10 text-white">
          <span className="font-medium">{title}</span>
          <span className="font-mono text-xs">{photos.length} photos</span>
        </span>
      </OmbraTrigger>
      <Viewer />
    </OmbraRoot>
  );
}

/** A child of the root, so it can read which photo is showing. */
function Viewer() {
  const { index } = useOmbraState();
  const active = photos[Math.max(0, index)];

  return (
    <OmbraPortal>
      <OmbraBackdrop />
      <OmbraContent className="p-0">
        {/* The header holds the title and every control. There is no zoom and no strip. */}
        <OmbraChrome>
          <header className="flex items-center gap-1 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-2 pl-[max(0.75rem,env(safe-area-inset-left))]">
            <div className="flex min-w-0 flex-1 flex-col">
              <OmbraTitle className="truncate font-medium">{title}</OmbraTitle>
              <OmbraCounter className="font-mono text-xs text-(--ombra-ink)/70 tabular-nums">
                {({ position, count }) => `${position} of ${count}`}
              </OmbraCounter>
            </div>
            <OmbraPrevious aria-label="Previous photo">
              <ChevronLeft aria-hidden="true" className="size-5" />
            </OmbraPrevious>
            <OmbraNext aria-label="Next photo">
              <ChevronRight aria-hidden="true" className="size-5" />
            </OmbraNext>
            <OmbraClose aria-label="Close album">
              <X aria-hidden="true" className="size-5" />
            </OmbraClose>
          </header>
        </OmbraChrome>

        <div className="relative min-h-0 min-w-0 flex-1">
          <OmbraSlides aria-label={title}>
            {photos.map((photo) => (
              <OmbraSlide
                key={photo.id}
                itemId={photo.id}
                aria-label={photo.alt}
                className="flex-col"
              >
                <div className="flex min-h-0 w-full flex-1 px-3 [container-type:size]">
                  <OmbraMedia width={photo.width} height={photo.height}>
                    <Picture
                      photo={photo}
                      sizes="100vw"
                      className="size-full rounded-md object-contain"
                    />
                  </OmbraMedia>
                </div>
                {/* Each slide carries its own caption, so it moves with the photo. */}
                <OmbraChrome className="w-full pt-3 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]">
                  <OmbraCaption described={photo.id === active?.id}>{photo.caption}</OmbraCaption>
                </OmbraChrome>
              </OmbraSlide>
            ))}
          </OmbraSlides>
        </div>
      </OmbraContent>
    </OmbraPortal>
  );
}
