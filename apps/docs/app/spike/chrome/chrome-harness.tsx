"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

import { OmbraCaption } from "../../../../../registry/ombra/ombra-caption";
import {
  OmbraCounter,
  OmbraNext,
  OmbraPrevious,
  OmbraThumbnail,
  OmbraThumbnails,
} from "../../../../../registry/ombra/ombra-controls";
import {
  OmbraBackdrop,
  OmbraChrome,
  OmbraClose,
  OmbraContent,
  OmbraPortal,
} from "../../../../../registry/ombra/ombra-dialog";
import { OmbraRoot, useOmbraState } from "../../../../../registry/ombra/ombra-root";
import { OmbraMedia, OmbraSlide, OmbraSlides } from "../../../../../registry/ombra/ombra-slides";
import { OmbraTrigger } from "../../../../../registry/ombra/ombra-trigger";

import { photos } from "../photos";

const LONG_CAPTION = Array.from(
  { length: 8 },
  () =>
    "A long caption keeps going past two lines, so the slot cuts it instead of growing over the thumbnail strip or the controls.",
).join(" ");

const source = photos.slice(0, 3);
const [first, second, third] = source;

if (!first || !second || !third) throw new Error("The bench needs three photos.");

type Item = {
  id: string;
  alt: string;
  width: number;
  height: number;
  src: string;
  thumbSrc: string;
  caption: ReactNode;
};

const items: readonly Item[] = [
  first,
  { ...second, caption: LONG_CAPTION },
  {
    ...third,
    caption: (
      <>
        <span data-testid="caption-credit" className="font-medium">
          Kyoto.
        </span>{" "}
        Evening along the canal.
      </>
    ),
  },
];

function Viewer() {
  const { index } = useOmbraState();
  const active = items[Math.max(0, index)];

  return (
    <OmbraPortal>
      <OmbraBackdrop />
      <OmbraContent data-slot="ombra-viewer" className="p-0">
        <Dialog.Title className="sr-only">{active?.alt ?? "Photo"}</Dialog.Title>
        <div data-slot="ombra-sheet" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <OmbraChrome
            render={<header />}
            className="flex touch-none items-center justify-between gap-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]"
          >
            <OmbraCounter className="font-mono text-xs whitespace-nowrap tabular-nums">
              {({ position, count }) => `${position} of ${count}`}
            </OmbraCounter>
            <OmbraClose aria-label="Close">Close</OmbraClose>
          </OmbraChrome>
          <div className="relative min-h-0 min-w-0 flex-1">
            <OmbraSlides>
              {items.map((item) => (
                <OmbraSlide key={item.id} itemId={item.id} aria-label={item.alt}>
                  <OmbraMedia width={item.width} height={item.height}>
                    <img
                      data-slot="ombra-image"
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
            <OmbraChrome className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-[max(0.5rem,env(safe-area-inset-left))]">
              <OmbraPrevious aria-label="Previous photo" className="pointer-events-auto">
                ‹
              </OmbraPrevious>
            </OmbraChrome>
            <OmbraChrome className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-[max(0.5rem,env(safe-area-inset-right))]">
              <OmbraNext aria-label="Next photo" className="pointer-events-auto">
                ›
              </OmbraNext>
            </OmbraChrome>
          </div>
          <OmbraChrome
            render={<footer />}
            className="pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]"
          >
            <OmbraCaption className="mb-3 tracking-wide">{active?.caption}</OmbraCaption>
            <OmbraThumbnails>
              {items.map((item) => (
                <OmbraThumbnail key={item.id} itemId={item.id} aria-label={item.alt}>
                  <img src={item.thumbSrc} alt="" className="h-full w-full object-cover" />
                </OmbraThumbnail>
              ))}
            </OmbraThumbnails>
          </OmbraChrome>
        </div>
      </OmbraContent>
    </OmbraPortal>
  );
}

/** Bench for a clipped caption, a node caption, and a counter formatted as "1 of 3". */
export function ChromeHarness() {
  return (
    <OmbraRoot itemIds={items.map((item) => item.id)}>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => (
          <OmbraTrigger key={item.id} itemId={item.id} aria-label={item.alt} className="block">
            <img src={item.thumbSrc} alt="" width={item.width} height={item.height} />
          </OmbraTrigger>
        ))}
      </div>
      <Viewer />
    </OmbraRoot>
  );
}
