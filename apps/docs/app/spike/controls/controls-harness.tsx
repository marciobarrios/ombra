"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { KeyboardEvent } from "react";

import {
  OmbraCounter,
  OmbraNext,
  OmbraPrevious,
  OmbraThumbnail,
  OmbraThumbnails,
} from "../../../../../registry/ombra/ombra-controls";
import {
  OmbraBackdrop,
  OmbraClose,
  OmbraContent,
  OmbraPortal,
} from "../../../../../registry/ombra/ombra-dialog";
import { OmbraRoot, useOmbraState } from "../../../../../registry/ombra/ombra-root";
import { OmbraMedia, OmbraSlide, OmbraSlides } from "../../../../../registry/ombra/ombra-slides";
import { OmbraTrigger } from "../../../../../registry/ombra/ombra-trigger";

import { photos } from "../photos";

const items = photos.slice(0, 5);
const itemIds = items.map((item) => item.id);

function Viewer({ controls }: { controls: boolean }) {
  const active = items[Math.max(0, useOmbraState().index)];

  // The consumer's handler runs first. Preventing End replaces the built-in shortcut.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "End") event.preventDefault();
  };

  return (
    <>
      <OmbraPortal>
        <OmbraBackdrop />
        <OmbraContent onKeyDown={onKeyDown} data-slot="ombra-viewer">
          <Dialog.Title className="sr-only">{active?.alt ?? "Foto"}</Dialog.Title>
          <div data-slot="ombra-sheet" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex flex-wrap items-center gap-2 p-3">
              <OmbraClose aria-label="Cerrar fotos">×</OmbraClose>
              {controls && (
                <OmbraCounter className="text-sm">
                  {({ position, count }) => `Foto ${position} de ${count}`}
                </OmbraCounter>
              )}
              <input
                aria-label="Nota"
                className="min-w-0 flex-1 rounded border border-current/30 bg-transparent px-2 py-1 text-sm"
              />
            </header>
            <div
              data-testid="panel"
              className="mx-3 overflow-x-auto whitespace-nowrap rounded border border-current/20 p-2 text-sm"
            >
              <button type="button" className="underline">
                Detalles
              </button>
              <span className="ml-2 inline-block w-[200vw]">
                Un panel de detalles que se desplaza.
              </span>
            </div>
            <div className="relative min-h-0 flex-1">
              <OmbraSlides>
                {items.map((item) => (
                  <OmbraSlide key={item.id} itemId={item.id} aria-label={item.alt}>
                    <OmbraMedia width={item.width} height={item.height}>
                      <img
                        src={item.src}
                        alt=""
                        width={item.width}
                        height={item.height}
                        draggable={false}
                      />
                    </OmbraMedia>
                  </OmbraSlide>
                ))}
              </OmbraSlides>
            </div>
            {controls && (
              <footer className="flex items-center gap-2 px-3 pb-3">
                <OmbraPrevious aria-label="Foto anterior">‹</OmbraPrevious>
                <OmbraThumbnails className="flex-1">
                  {items.map((item) => (
                    <OmbraThumbnail key={item.id} itemId={item.id} aria-label={item.alt}>
                      <img src={item.thumbSrc} alt="" className="h-full w-full object-cover" />
                    </OmbraThumbnail>
                  ))}
                </OmbraThumbnails>
                <OmbraNext aria-label="Foto siguiente">›</OmbraNext>
              </footer>
            )}
          </div>
        </OmbraContent>
      </OmbraPortal>
    </>
  );
}

export function ControlsHarness({ controls }: { controls: boolean }) {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-12">
      <h1 className="text-2xl text-foreground">Viewer controls test bench</h1>
      <OmbraRoot itemIds={itemIds}>
        <div className="grid grid-cols-5 gap-3">
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
        <Viewer controls={controls} />
      </OmbraRoot>
    </main>
  );
}
