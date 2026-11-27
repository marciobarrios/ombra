"use client";

import { ChevronRight, X } from "lucide-react";
import { useReducer } from "react";

import { OmbraNext } from "@/components/ombra/ombra-controls";
import {
  OmbraBackdrop,
  OmbraClose,
  OmbraContent,
  OmbraPortal,
} from "@/components/ombra/ombra-dialog";
import { OmbraRoot } from "@/components/ombra/ombra-root";
import { OmbraMedia, OmbraSlide, OmbraSlides } from "@/components/ombra/ombra-slides";
import { OmbraTrigger } from "@/components/ombra/ombra-trigger";

import { photos } from "./photos";

/** The parent owns both values. The lightbox only asks to change them. */
type Viewer = { open: boolean; activeId: string | null };

type ViewerEvent =
  | { type: "open-change-asked"; open: boolean }
  | { type: "active-change-asked"; itemId: string }
  | { type: "photo-picked"; itemId: string };

function viewerReducer(state: Viewer, event: ViewerEvent): Viewer {
  switch (event.type) {
    case "open-change-asked":
      return { ...state, open: event.open };
    case "active-change-asked":
      return { ...state, activeId: event.itemId };
    case "photo-picked":
      // A button outside the lightbox opens it on the photo it names.
      return { open: true, activeId: event.itemId };
  }
}

const initialViewer: Viewer = { open: false, activeId: photos[0]?.id ?? null };

export function ControlledLightbox() {
  const [viewer, dispatch] = useReducer(viewerReducer, initialViewer);
  const active = photos.find((photo) => photo.id === viewer.activeId);

  return (
    <OmbraRoot
      itemIds={photos.map((photo) => photo.id)}
      open={viewer.open}
      onOpenChange={(open) => dispatch({ type: "open-change-asked", open })}
      activeId={viewer.activeId}
      onActiveIdChange={(itemId) => dispatch({ type: "active-change-asked", itemId })}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => dispatch({ type: "photo-picked", itemId: photo.id })}
              className="rounded-md border border-foreground/15 px-3 py-1.5 text-sm capitalize hover:bg-foreground/5"
            >
              Open {photo.id}
            </button>
          ))}
        </div>
        <output className="font-mono text-xs text-foreground/70">
          {viewer.open ? "Open" : "Closed"} on {active?.id ?? "nothing"}
        </output>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((photo) => (
            <OmbraTrigger
              key={photo.id}
              itemId={photo.id}
              className="block aspect-square overflow-hidden rounded-md"
            >
              <img
                src={photo.thumbSrc}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                className="size-full object-cover"
              />
            </OmbraTrigger>
          ))}
        </div>
      </div>

      <OmbraPortal>
        <OmbraBackdrop />
        <OmbraContent aria-label="Photos">
          <header className="flex justify-end gap-1 p-3">
            <OmbraNext aria-label="Next photo">
              <ChevronRight aria-hidden="true" className="size-5" />
            </OmbraNext>
            <OmbraClose aria-label="Close">
              <X aria-hidden="true" className="size-5" />
            </OmbraClose>
          </header>
          <div className="min-h-0 flex-1 pb-3">
            <OmbraSlides>
              {photos.map((photo) => (
                <OmbraSlide key={photo.id} itemId={photo.id} aria-label={photo.alt}>
                  <OmbraMedia width={photo.width} height={photo.height}>
                    <img
                      src={photo.src}
                      alt=""
                      width={photo.width}
                      height={photo.height}
                      draggable={false}
                    />
                  </OmbraMedia>
                </OmbraSlide>
              ))}
            </OmbraSlides>
          </div>
        </OmbraContent>
      </OmbraPortal>
    </OmbraRoot>
  );
}
