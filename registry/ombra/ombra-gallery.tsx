"use client";

// The default gallery: an optional recipe built only from Ombra's public parts. Copy it and
// edit the JSX to move, replace or leave out any part.

import { cn } from "cn";
import { createContext, useContext, useLayoutEffect } from "react";
import type { ReactNode } from "react";

import { connectionHint, loadOrder, loadReach } from "./load-window";
import { OmbraCaption } from "./ombra-caption";
import {
  OmbraCounter,
  OmbraNext,
  OmbraPrevious,
  OmbraThumbnail,
  OmbraThumbnails,
} from "./ombra-controls";
import {
  OmbraBackdrop,
  OmbraChrome,
  OmbraClose,
  OmbraContent,
  OmbraPortal,
  OmbraTitle,
} from "./ombra-dialog";
import { OmbraRoot, useOmbraState } from "./ombra-root";
import type { OmbraRootProps } from "./ombra-root";
import { OmbraMedia, OmbraSlide, OmbraSlides } from "./ombra-slides";
import { OmbraTrigger } from "./ombra-trigger";
import type { OmbraTriggerProps } from "./ombra-trigger";
import { OmbraZoom, OmbraZoomIn, OmbraZoomOut, OmbraZoomReset } from "./ombra-zoom";
import type { OmbraGalleryItem } from "./types";
import { useReducerWithBailout } from "./use-reducer-with-bailout";

export type { OmbraGalleryItem };

export type OmbraGalleryProps = Omit<OmbraRootProps, "children" | "itemIds"> & {
  /** Each item's `id` is its stable identity: a reorder keeps the open photo open. */
  items: readonly OmbraGalleryItem[];
  /** Shows the thumbnail strip under the photo. Defaults to true. A single photo never has one. */
  thumbnails?: boolean;
  className?: string;
  /**
   * The triggers' layout. Defaults to `OmbraGalleryGrid`; pass `OmbraBento`, `OmbraMosaic` or
   * your own triggers. Layouts read the items with `useOmbraGalleryItems()`.
   */
  children?: ReactNode;
};

const GalleryItemsContext = createContext<readonly OmbraGalleryItem[] | null>(null);

/** The gallery's items, for a layout rendered inside `OmbraGallery`. */
export function useOmbraGalleryItems(): readonly OmbraGalleryItem[] {
  const items = useContext(GalleryItemsContext);

  if (!items) throw new Error("Ombra: a gallery layout must render inside OmbraGallery.");

  return items;
}

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

export function OmbraGallery({
  items,
  thumbnails = true,
  className,
  children,
  ...root
}: OmbraGalleryProps) {
  return (
    <OmbraRoot {...root} itemIds={items.map((item) => item.id)}>
      <GalleryItemsContext.Provider value={items}>
        <GalleryParts items={items} thumbnails={thumbnails} className={className}>
          {children ?? <OmbraGalleryGrid />}
        </GalleryParts>
      </GalleryItemsContext.Provider>
    </OmbraRoot>
  );
}

export type OmbraGalleryTileProps = Omit<OmbraTriggerProps, "itemId" | "className" | "children"> & {
  /** The photo the tile shows and opens. */
  item: OmbraGalleryItem;
  /** The thumbnail's `sizes`, for the tile's width in the layout. */
  sizes?: string;
  className?: string;
  /** Drawn over the photo, such as an overflow count. */
  children?: ReactNode;
};

/** One trigger: a button holding the item's cover-cropped thumbnail, named by its `alt`. */
export function OmbraGalleryTile({
  item,
  sizes = "(min-width: 768px) 30vw, 50vw",
  className,
  children,
  ...props
}: OmbraGalleryTileProps) {
  return (
    <OmbraTrigger
      {...props}
      itemId={item.id}
      className={cn(
        "relative block min-w-0 overflow-hidden rounded-[6px] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:inset-ring after:inset-ring-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
        className,
      )}
    >
      <img
        src={item.thumbSrc}
        srcSet={item.srcSet}
        sizes={sizes}
        alt={item.alt}
        width={item.width}
        height={item.height}
        className="h-full w-full rounded-[inherit] object-cover"
      />
      {children}
    </OmbraTrigger>
  );
}

/** The default layout: a plain grid with one tile per item, each in its own frame. */
export function OmbraGalleryGrid({ className }: { className?: string }) {
  const items = useOmbraGalleryItems();

  return (
    <div
      data-slot="ombra-gallery-grid"
      className={cn("grid grid-cols-2 items-start gap-3 md:grid-cols-3", className)}
    >
      {items.map((item) => (
        <OmbraGalleryTile key={item.id} item={item} style={{ aspectRatio: item.frame }} />
      ))}
    </div>
  );
}

function GalleryParts({
  items,
  thumbnails,
  className,
  children,
}: Pick<OmbraGalleryProps, "items" | "thumbnails" | "className" | "children">) {
  const { open, index: activeAt } = useOmbraState();
  const index = Math.max(0, activeAt);
  const count = items.length;
  const [{ sharpIds }, sendView] = useReducerWithBailout(viewReducer, initialViewState);
  const active = items[index];

  useLayoutEffect(() => {
    if (!open) return;

    let cancelled = false;

    // Decode the full-size file off screen and swap it in only once it can paint, so the
    // thumbnail never gives way to a blank box. Decoded sources stay, so changing
    // selection never downgrades an outgoing photo.
    function load(item: OmbraGalleryItem): Promise<void> {
      const loader = new Image();

      loader.sizes = "100vw";
      loader.srcset = item.srcSet;
      loader.src = item.src;

      return loader.decode().then(
        () => {
          if (!cancelled) sendView({ type: "decoded", id: item.id });
        },
        // A file that fails keeps the thumbnail.
        () => undefined,
      );
    }

    // The active photo first, then its neighbours, so they never compete with it.
    const [current, ...neighbours] = loadOrder(items, index, loadReach(connectionHint()));

    if (current) {
      void load(current).then(() => {
        if (cancelled) return;

        for (const item of neighbours) void load(item);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [open, index, items]);

  return (
    <div data-slot="ombra-root" className={cn("text-foreground", className)}>
      {children}

      {/* OmbraRoot supplies the Base UI dialog root, shared with the triggers above. */}
      <OmbraPortal>
        <OmbraBackdrop />
        <OmbraContent data-slot="ombra-viewer" className="p-0">
          <OmbraTitle className="sr-only">{active?.alt || active?.caption || "Photo"}</OmbraTitle>
          <div data-slot="ombra-sheet" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <OmbraChrome>
              <header className="flex touch-none flex-col gap-2 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col items-start gap-2">
                    <OmbraCounter className="font-mono text-xs tracking-wide whitespace-nowrap text-(--ombra-ink)/80 tabular-nums" />
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
                          className="group/media rounded-[6px] outline outline-1 -outline-offset-1 outline-(--ombra-ink)/10 data-[status=error]:bg-(--ombra-ink)/5"
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
                            className="rounded-[inherit] group-data-[status=error]/media:opacity-0"
                          />
                          {/* A failed photo keeps its box, and the viewer stays usable around it. */}
                          <span
                            data-slot="ombra-media-fallback"
                            className="absolute inset-0 hidden items-center justify-center p-4 text-center text-sm text-(--ombra-ink)/70 group-data-[status=error]/media:flex"
                          >
                            This photo could not load.
                          </span>
                        </OmbraMedia>
                      </OmbraZoom>
                    </OmbraSlide>
                  );
                })}
              </OmbraSlides>
              <OmbraChrome className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-[max(0.5rem,env(safe-area-inset-left))]">
                <div data-slot="ombra-nav" className="flex">
                  <OmbraPrevious
                    aria-label="Previous photo"
                    className="pointer-events-auto bg-(--ombra-surface)/40"
                  >
                    <Chevron direction="left" />
                  </OmbraPrevious>
                </div>
              </OmbraChrome>
              <OmbraChrome className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-[max(0.5rem,env(safe-area-inset-right))]">
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
              <footer className="pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]">
                <OmbraCaption className="mb-3">{active?.caption}</OmbraCaption>
                {thumbnails && (
                  <OmbraThumbnails aria-label="Thumbnails">
                    {items.map((item) => (
                      <OmbraThumbnail key={item.id} itemId={item.id} aria-label={item.alt}>
                        {/* The grid's source, so the strip costs no extra request. */}
                        <img
                          src={item.thumbSrc}
                          alt=""
                          className="h-full w-full rounded-[6px] object-cover outline outline-1 -outline-offset-1 outline-(--ombra-ink)/10"
                        />
                      </OmbraThumbnail>
                    ))}
                  </OmbraThumbnails>
                )}
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
