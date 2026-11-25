"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ChevronLeft, ChevronRight, Minus, Plus, Square, X } from "lucide-react";

import { OmbraCaption } from "@/components/ombra/ombra-caption";
import {
  OmbraCounter,
  OmbraNext,
  OmbraPrevious,
  OmbraThumbnail,
  OmbraThumbnails,
} from "@/components/ombra/ombra-controls";
import {
  OmbraBackdrop,
  OmbraChrome,
  OmbraClose,
  OmbraContent,
  OmbraPortal,
} from "@/components/ombra/ombra-dialog";
import { OmbraRoot, useOmbraState } from "@/components/ombra/ombra-root";
import { OmbraMedia, OmbraSlide, OmbraSlides } from "@/components/ombra/ombra-slides";
import { OmbraTrigger } from "@/components/ombra/ombra-trigger";
import {
  OmbraZoom,
  OmbraZoomIn,
  OmbraZoomOut,
  OmbraZoomReset,
} from "@/components/ombra/ombra-zoom";

import { photos } from "./photos";

export function FullGallery() {
  return (
    <OmbraRoot itemIds={photos.map((photo) => photo.id)}>
      <div className="columns-2 gap-3 md:columns-3">
        {photos.map((photo) => (
          <OmbraTrigger
            key={photo.id}
            itemId={photo.id}
            className="mb-3 block w-full break-inside-avoid overflow-hidden rounded-md"
          >
            <img
              src={photo.thumbSrc}
              srcSet={photo.srcSet}
              sizes="(min-width: 768px) 30vw, 50vw"
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              className="h-auto w-full object-cover"
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
        <Dialog.Title className="sr-only">{active?.alt ?? "Photo"}</Dialog.Title>
        {/* The registry CSS scales this wrapper while the viewer is pulled to dismiss. */}
        <div data-slot="ombra-sheet" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <OmbraChrome>
            {/* The content drops its own padding, so the chrome keeps clear of the notch. */}
            <header className="flex items-center justify-between gap-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-3 pl-[max(0.75rem,env(safe-area-inset-left))]">
              <OmbraCounter className="font-mono text-xs tabular-nums" />
              <div className="flex items-center gap-1">
                <OmbraZoomOut aria-label="Zoom out">
                  <Minus aria-hidden="true" className="size-5" />
                </OmbraZoomOut>
                <OmbraZoomReset aria-label="Reset zoom">
                  <Square aria-hidden="true" className="size-4" />
                </OmbraZoomReset>
                <OmbraZoomIn aria-label="Zoom in">
                  <Plus aria-hidden="true" className="size-5" />
                </OmbraZoomIn>
                <OmbraClose aria-label="Close">
                  <X aria-hidden="true" className="size-5" />
                </OmbraClose>
              </div>
            </header>
          </OmbraChrome>

          <div className="relative min-h-0 flex-1">
            <OmbraSlides aria-label="Photographs">
              {photos.map((photo, photoIndex) => (
                <OmbraSlide
                  key={photo.id}
                  itemId={photo.id}
                  aria-label={`${photoIndex + 1} of ${photos.length}`}
                >
                  <OmbraZoom>
                    <OmbraMedia width={photo.width} height={photo.height}>
                      <img
                        src={photo.src}
                        srcSet={photo.srcSet}
                        sizes="100vw"
                        alt={photoIndex === index ? photo.alt : ""}
                        width={photo.width}
                        height={photo.height}
                        draggable={false}
                      />
                    </OmbraMedia>
                  </OmbraZoom>
                </OmbraSlide>
              ))}
            </OmbraSlides>
            <OmbraChrome className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-[max(0.5rem,env(safe-area-inset-left))]">
              <OmbraPrevious aria-label="Previous photo" className="pointer-events-auto">
                <ChevronLeft aria-hidden="true" className="size-5" />
              </OmbraPrevious>
            </OmbraChrome>
            <OmbraChrome className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-[max(0.5rem,env(safe-area-inset-right))]">
              <OmbraNext aria-label="Next photo" className="pointer-events-auto">
                <ChevronRight aria-hidden="true" className="size-5" />
              </OmbraNext>
            </OmbraChrome>
          </div>

          <OmbraChrome>
            <footer className="pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]">
              <OmbraCaption className="mb-3">{active?.caption}</OmbraCaption>
              <OmbraThumbnails aria-label="Thumbnails">
                {photos.map((photo) => (
                  <OmbraThumbnail key={photo.id} itemId={photo.id} aria-label={photo.alt}>
                    <img
                      src={photo.thumbSrc}
                      alt=""
                      className="size-full rounded-md object-cover"
                    />
                  </OmbraThumbnail>
                ))}
              </OmbraThumbnails>
            </footer>
          </OmbraChrome>
        </div>
      </OmbraContent>
    </OmbraPortal>
  );
}
