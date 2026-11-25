"use client";

import Image from "next/image";

import {
  OmbraBackdrop,
  OmbraClose,
  OmbraContent,
  OmbraPortal,
  OmbraTitle,
} from "../../../../../registry/ombra/ombra-dialog";
import { OmbraRoot, useOmbraState } from "../../../../../registry/ombra/ombra-root";
import { OmbraMedia, OmbraSlide, OmbraSlides } from "../../../../../registry/ombra/ombra-slides";
import { OmbraTrigger } from "../../../../../registry/ombra/ombra-trigger";

import { photos } from "../photos";

const items = photos.slice(0, 4);
const itemIds = items.map((item) => item.id);

function Viewer() {
  const active = items[Math.max(0, useOmbraState().index)];

  return (
    <>
      <OmbraPortal>
        <OmbraBackdrop />
        <OmbraContent data-slot="ombra-viewer">
          <OmbraTitle className="sr-only">{active?.alt ?? "Photo"}</OmbraTitle>
          <div data-slot="ombra-sheet" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex justify-end p-3">
              <OmbraClose aria-label="Close photos">×</OmbraClose>
            </header>
            <div className="min-h-0 flex-1">
              <OmbraSlides>
                {items.map((item) => (
                  <OmbraSlide
                    key={item.id}
                    itemId={item.id}
                    aria-label={item.alt}
                    className="flex-col gap-3 py-2"
                  >
                    {/* The media fits this box, which leaves room for the caption below. */}
                    <div className="flex min-h-0 w-full flex-1 [container-type:size]">
                      {/* Narrower than the fit, so the morph must land on the media's own box. */}
                      <OmbraMedia width={item.width} height={item.height} className="max-w-[70%]">
                        <Image
                          src={item.src}
                          alt=""
                          width={item.width}
                          height={item.height}
                          sizes="100vw"
                          draggable={false}
                        />
                      </OmbraMedia>
                    </div>
                    <figure data-testid="caption" className="text-center text-sm">
                      <figcaption>{item.caption}</figcaption>
                    </figure>
                  </OmbraSlide>
                ))}
              </OmbraSlides>
            </div>
          </div>
        </OmbraContent>
      </OmbraPortal>
    </>
  );
}

export function MediaHarness() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-12">
      <h1 className="text-2xl text-foreground">OmbraMedia test bench</h1>
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
        <Viewer />
      </OmbraRoot>
    </main>
  );
}
