"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useReducer } from "react";

import {
  OmbraBackdrop,
  OmbraClose,
  OmbraContent,
  OmbraPortal,
} from "../../../../../registry/ombra/ombra-dialog";
import { OmbraRoot, useOmbraState } from "../../../../../registry/ombra/ombra-root";
import { OmbraMedia, OmbraSlide, OmbraSlides } from "../../../../../registry/ombra/ombra-slides";
import { OmbraTrigger } from "../../../../../registry/ombra/ombra-trigger";
import {
  OmbraZoom,
  OmbraZoomIn,
  OmbraZoomOut,
  OmbraZoomReset,
} from "../../../../../registry/ombra/ombra-zoom";

import { photos } from "../photos";

export type ZoomMode = "all" | "first" | "off";

const items = photos.slice(0, 4);
const itemIds = items.map((item) => item.id);

type SurfaceAction = { type: "surfaces-toggled" };

/** Whether the slides render their `OmbraZoom`, so a spec can remove it while zoomed. */
function surfacesReducer(shown: boolean, _action: SurfaceAction): boolean {
  return !shown;
}

function Viewer({ mode }: { mode: ZoomMode }) {
  const active = items[Math.max(0, useOmbraState().index)];
  const [surfaces, sendSurfaces] = useReducer(surfacesReducer, true);

  return (
    <>
      <OmbraPortal>
        <OmbraBackdrop />
        <OmbraContent data-slot="ombra-viewer">
          <Dialog.Title className="sr-only">{active?.alt ?? "Foto"}</Dialog.Title>
          <div data-slot="ombra-sheet" className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* The actions sit wherever the consumer puts them, with the consumer's labels. */}
            <header className="flex items-center justify-between gap-2 p-3">
              <OmbraClose aria-label="Cerrar fotos">×</OmbraClose>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="px-2 text-sm"
                  onClick={() => sendSurfaces({ type: "surfaces-toggled" })}
                >
                  {surfaces ? "Quitar zoom" : "Poner zoom"}
                </button>
                <OmbraZoomOut aria-label="Alejar">−</OmbraZoomOut>
                <OmbraZoomReset aria-label="Restablecer zoom">1</OmbraZoomReset>
                <OmbraZoomIn aria-label="Acercar">+</OmbraZoomIn>
              </div>
            </header>
            <div className="min-h-0 flex-1">
              <OmbraSlides>
                {items.map((item, itemIndex) => {
                  const media = (
                    <OmbraMedia
                      width={item.width}
                      height={item.height}
                      className="rounded-[6px] outline outline-1 -outline-offset-1 outline-(--ombra-ink)/10"
                    >
                      <img
                        src={item.src}
                        alt=""
                        width={item.width}
                        height={item.height}
                        draggable={false}
                        className="rounded-[inherit]"
                      />
                    </OmbraMedia>
                  );

                  const zoomable =
                    surfaces && (mode === "all" || (mode === "first" && itemIndex === 0));

                  return (
                    <OmbraSlide key={item.id} itemId={item.id} aria-label={item.alt}>
                      {zoomable ? <OmbraZoom>{media}</OmbraZoom> : media}
                    </OmbraSlide>
                  );
                })}
              </OmbraSlides>
            </div>
          </div>
        </OmbraContent>
      </OmbraPortal>
    </>
  );
}

export function ZoomHarness({ mode }: { mode: ZoomMode }) {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-12">
      <h1 className="text-2xl text-foreground">OmbraZoom test bench</h1>
      <OmbraRoot itemIds={itemIds}>
        <div className="grid grid-cols-4 gap-3">
          {items.map((item) => (
            <OmbraTrigger
              key={item.id}
              itemId={item.id}
              className="block aspect-square overflow-hidden rounded-[6px]"
            >
              <img
                src={item.thumbSrc}
                alt={item.alt}
                width={item.width}
                height={item.height}
                className="h-full w-full object-cover"
              />
            </OmbraTrigger>
          ))}
        </div>
        <Viewer mode={mode} />
      </OmbraRoot>
    </main>
  );
}
