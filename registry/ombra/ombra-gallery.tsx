"use client";

// The default gallery: an optional recipe built only from Ombra's public parts. Copy it and
// edit the JSX to move, replace or leave out any part.

import { Dialog } from "@base-ui/react/dialog";
import { cn } from "cn";
import { useLayoutEffect } from "react";

import {
  OmbraCounter,
  OmbraNext,
  OmbraPrevious,
  OmbraThumbnail,
  OmbraThumbnails,
} from "./ombra-controls";
import { OmbraBackdrop, OmbraChrome, OmbraClose, OmbraContent, OmbraPortal } from "./ombra-dialog";
import { OmbraRoot, useOmbraState } from "./ombra-root";
import type { OmbraRootProps } from "./ombra-root";
import { OmbraMedia, OmbraSlide, OmbraSlides } from "./ombra-slides";
import { OmbraTrigger } from "./ombra-trigger";
import { OmbraZoom, OmbraZoomIn, OmbraZoomOut, OmbraZoomReset } from "./ombra-zoom";
import type { OmbraGalleryItem } from "./types";
import { useReducerWithBailout } from "./use-reducer-with-bailout";

export type { OmbraGalleryItem };

export type OmbraGalleryProps = Omit<OmbraRootProps, "children" | "itemIds"> & {
  /** Each item's `id` is its stable identity: a reorder keeps the open photo open. */
  items: readonly OmbraGalleryItem[];
  className?: string;
};

/** Photos whose full-size source has decoded, so the slide can drop its thumbnail. */
type ViewState = { sharpIds: ReadonlySet<string> };

type ViewAction = { type: "decoded"; id: string };

const initialViewState: ViewState = { sharpIds: new Set() };

function slideAnnouncement(
  items: readonly OmbraGalleryItem[],
  itemId: string,
  position: number,
  count: number,
): string {
  const caption = items.find((item) => item.id === itemId)?.caption;

  return caption ? `Image ${position} of ${count}. ${caption}` : `Image ${position} of ${count}`;
}

function viewReducer(state: ViewState, action: ViewAction): ViewState {
  switch (action.type) {
    case "decoded":
      if (state.sharpIds.has(action.id)) return state;

      return { sharpIds: new Set([...state.sharpIds, action.id]) };
  }
}

export function OmbraGallery({ items, className, ...root }: OmbraGalleryProps) {
  return (
    <OmbraRoot {...root} itemIds={items.map((item) => item.id)}>
      <GalleryParts items={items} className={className} />
    </OmbraRoot>
  );
}

function GalleryParts({ items, className }: Pick<OmbraGalleryProps, "items" | "className">) {
  const { open, index: activeAt } = useOmbraState();
  const index = Math.max(0, activeAt);
  const count = items.length;
  const [{ sharpIds }, sendView] = useReducerWithBailout(viewReducer, initialViewState);
  const active = items[index];

  useLayoutEffect(() => {
    if (!open) return;

    let cancelled = false;

    // Decode the neighbors before they enter the viewport, and retain decoded
    // sources so changing selection never downgrades an outgoing photo.
    for (const item of items.slice(Math.max(0, index - 1), index + 2)) {
      const loader = new Image();

      loader.sizes = "100vw";
      loader.srcset = item.srcSet;
      loader.src = item.src;

      void loader.decode().then(
        () => {
          if (cancelled) return;

          sendView({ type: "decoded", id: item.id });
        },
        () => undefined,
      );
    }

    return () => {
      cancelled = true;
    };
  }, [open, index, items]);

  return (
    <div data-slot="ombra-root" className={cn("text-foreground", className)}>
      <div className="columns-2 gap-3 md:columns-3">
        {items.map((item) => (
          <OmbraTrigger
            key={item.id}
            itemId={item.id}
            className="relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-[6px] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:inset-ring after:inset-ring-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            style={{ aspectRatio: item.frame }}
          >
            <img
              src={item.thumbSrc}
              srcSet={item.srcSet}
              sizes="(min-width: 768px) 30vw, 50vw"
              alt={item.alt}
              width={item.width}
              height={item.height}
              className="h-full w-full rounded-[inherit] object-cover"
            />
          </OmbraTrigger>
        ))}
      </div>

      <p className="mt-10 max-w-xl text-sm leading-6 text-foreground/70">
        Photographs from Unsplash, used under the Unsplash License. Thumbnails are cover crops; the
        viewer shows the full frame.
      </p>

      {/* OmbraRoot supplies the Base UI dialog root, shared with the triggers above. */}
      <OmbraPortal>
        <OmbraBackdrop />
        <OmbraContent data-slot="ombra-viewer" className="p-0">
          <Dialog.Title className="sr-only">
            {active?.alt || active?.caption || "Photo"}
          </Dialog.Title>
          <Dialog.Description className="sr-only">{active?.caption ?? ""}</Dialog.Description>
          <div data-slot="ombra-sheet" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <OmbraChrome>
              <header className="flex touch-none flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col items-start gap-2">
                    <OmbraCounter className="font-mono text-xs tracking-wide text-(--ombra-ink)/80" />
                  </div>
                  <div className="flex items-center gap-1">
                    <OmbraZoomOut aria-label="Zoom out">
                      <MinusIcon />
                    </OmbraZoomOut>
                    <OmbraZoomReset aria-label="Reset zoom">
                      <ResetIcon />
                    </OmbraZoomReset>
                    <OmbraZoomIn aria-label="Zoom in">
                      <PlusIcon />
                    </OmbraZoomIn>
                    <OmbraClose aria-label="Close">
                      <CloseIcon />
                    </OmbraClose>
                  </div>
                </div>
              </header>
            </OmbraChrome>

            <div className="relative min-h-0 min-w-0 flex-1">
              <OmbraSlides
                aria-label="Photographs"
                announce={(itemId, position, count) =>
                  slideAnnouncement(items, itemId, position, count)
                }
              >
                {items.map((item, itemIndex) => {
                  const sharp = sharpIds.has(item.id);
                  const current = itemIndex === index;

                  return (
                    <OmbraSlide
                      key={item.id}
                      itemId={item.id}
                      aria-label={`${itemIndex + 1} of ${count}`}
                    >
                      <OmbraZoom>
                        <OmbraMedia
                          width={item.width}
                          height={item.height}
                          className="rounded-[6px] outline outline-1 -outline-offset-1 outline-(--ombra-ink)/10"
                        >
                          <img
                            data-slot="ombra-image"
                            data-active={current ? "true" : "false"}
                            src={sharp ? item.src : item.thumbSrc}
                            srcSet={sharp ? item.srcSet : undefined}
                            sizes="100vw"
                            alt={current ? item.alt : ""}
                            width={item.width}
                            height={item.height}
                            draggable={false}
                            fetchPriority={current ? "high" : "low"}
                            className="rounded-[inherit]"
                          />
                        </OmbraMedia>
                      </OmbraZoom>
                    </OmbraSlide>
                  );
                })}
              </OmbraSlides>
              <OmbraChrome className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2">
                <div data-slot="ombra-nav" className="flex">
                  <OmbraPrevious
                    aria-label="Previous photo"
                    className="pointer-events-auto bg-(--ombra-surface)/40"
                  >
                    <Chevron direction="left" />
                  </OmbraPrevious>
                </div>
              </OmbraChrome>
              <OmbraChrome className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                <div data-slot="ombra-nav" className="flex">
                  <OmbraNext
                    aria-label="Next photo"
                    className="pointer-events-auto bg-(--ombra-surface)/40"
                  >
                    <Chevron direction="right" />
                  </OmbraNext>
                </div>
              </OmbraChrome>
            </div>

            <OmbraChrome>
              <footer className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <p
                  data-slot="ombra-caption"
                  className="mb-3 touch-none text-center text-sm text-(--ombra-ink)/80"
                >
                  {active?.caption}
                </p>
                <OmbraThumbnails>
                  {items.map((item) => (
                    <OmbraThumbnail key={item.id} itemId={item.id} aria-label={item.alt}>
                      <img
                        src={item.thumbSrc}
                        alt=""
                        className="h-full w-full rounded-[6px] object-cover outline outline-1 -outline-offset-1 outline-(--ombra-ink)/10"
                      />
                    </OmbraThumbnail>
                  ))}
                </OmbraThumbnails>
              </footer>
            </OmbraChrome>
          </div>
        </OmbraContent>
      </OmbraPortal>
    </div>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path
        d={direction === "left" ? "M12 4 L6 10 L12 16" : "M8 4 L14 10 L8 16"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path
        d="M10 4 V16 M4 10 H16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path
        d="M4 10 H16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <rect
        x="5"
        y="5"
        width="10"
        height="10"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path
        d="M5 5 L15 15 M15 5 L5 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
