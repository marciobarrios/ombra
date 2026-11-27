"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";

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

export function JsxChanges() {
  return (
    <OmbraRoot itemIds={photos.map((photo) => photo.id)}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((photo) => (
          <OmbraTrigger
            key={photo.id}
            itemId={photo.id}
            className="block aspect-square overflow-hidden rounded-md"
          >
            {/* Next.js Image renders one `<img>`, so the morph flies from it like any other. */}
            <Image
              src={photo.thumbSrc}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              sizes="(min-width: 640px) 25vw, 50vw"
              className="size-full object-cover"
            />
          </OmbraTrigger>
        ))}
      </div>
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
        <OmbraTitle className="sr-only">{active?.alt ?? "Photo"}</OmbraTitle>
        <div data-slot="ombra-sheet" className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* No OmbraZoom around the media, so the photos do not zoom. */}
          <div className="min-h-0 flex-1 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <OmbraSlides aria-label="Photographs">
              {photos.map((photo, photoIndex) => (
                <OmbraSlide
                  key={photo.id}
                  itemId={photo.id}
                  aria-label={`${photoIndex + 1} of ${photos.length}`}
                >
                  <OmbraMedia width={photo.width} height={photo.height}>
                    <Image
                      src={photo.src}
                      alt={photoIndex === index ? photo.alt : ""}
                      width={photo.width}
                      height={photo.height}
                      sizes="100vw"
                      draggable={false}
                    />
                  </OmbraMedia>
                </OmbraSlide>
              ))}
            </OmbraSlides>
          </div>

          {/* Every control moved into one bar under the photo, and no thumbnail strip. */}
          <OmbraChrome>
            <footer className="flex flex-col gap-2 pt-3 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))]">
              <OmbraCaption className="text-center">{active?.caption}</OmbraCaption>
              <div className="flex items-center justify-center gap-2">
                <OmbraPrevious aria-label="Previous photo">
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </OmbraPrevious>
                <OmbraCounter className="font-mono text-xs tabular-nums" />
                <OmbraNext aria-label="Next photo">
                  <ChevronRight aria-hidden="true" className="size-5" />
                </OmbraNext>
                <OmbraClose aria-label="Close">
                  <X aria-hidden="true" className="size-5" />
                </OmbraClose>
              </div>
            </footer>
          </OmbraChrome>
        </div>
      </OmbraContent>
    </OmbraPortal>
  );
}
