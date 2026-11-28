"use client";

// A second recipe from the same public parts as the gallery: one cover opens the whole album,
// the header holds the title and every control, photos render through `<picture>`, and
// there is no thumbnail strip and no zoom. Each of those is a JSX choice in this file.

import { cn } from "cn";

import { OmbraCaption } from "./ombra-caption";
import { OmbraCounter, OmbraNext, OmbraPrevious } from "./ombra-controls";
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

/** The recipe's own photo shape. The root needs only the IDs. */
export type OmbraAlbumPhoto = {
  id: string;
  alt: string;
  caption?: string;
  width: number;
  height: number;
  /** The fallback source. */
  src: string;
  /** Sources the browser may prefer, such as a modern format, offered through `<source>`. */
  sources?: readonly { srcSet: string; type: string }[];
};

export type OmbraAlbumProps = Omit<OmbraRootProps, "children" | "itemIds"> & {
  /** The album's name: the cover's label and the viewer's visible title. */
  title: string;
  /** The first photo is the cover. */
  photos: readonly OmbraAlbumPhoto[];
  className?: string;
};

function Picture({
  photo,
  sizes,
  className,
}: {
  photo: OmbraAlbumPhoto;
  sizes: string;
  className?: string;
}) {
  return (
    <picture className="contents">
      {photo.sources?.map((source) => (
        <source key={source.type} type={source.type} srcSet={source.srcSet} sizes={sizes} />
      ))}
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

export function OmbraAlbum({ title, photos, className, ...root }: OmbraAlbumProps) {
  const cover = photos[0];

  if (!cover) return null;

  return (
    <OmbraRoot {...root} itemIds={photos.map((photo) => photo.id)}>
      <OmbraTrigger
        itemId={cover.id}
        className={cn(
          "relative block w-full overflow-hidden rounded-[6px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
          className,
        )}
        style={{ aspectRatio: `${cover.width} / ${cover.height}` }}
      >
        <Picture
          photo={cover}
          sizes="(min-width: 768px) 40vw, 100vw"
          className="h-full w-full object-cover"
        />
        {/* The cover is named by this text, so speech input can say what it shows. */}
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-linear-to-t from-black/60 to-transparent p-3 pt-10 text-white">
          <span className="text-base font-medium">{title}</span>
          <span className="font-mono text-xs">{photos.length} photos</span>
        </span>
      </OmbraTrigger>

      <OmbraPortal>
        <OmbraBackdrop />
        <OmbraContent data-slot="ombra-album" className="p-0">
          <AlbumViewer title={title} photos={photos} />
        </OmbraContent>
      </OmbraPortal>
    </OmbraRoot>
  );
}

function AlbumViewer({ title, photos }: Pick<OmbraAlbumProps, "title" | "photos">) {
  const { index } = useOmbraState();
  const active = photos[Math.max(0, index)];

  return (
    <>
      <OmbraChrome>
        <header
          data-slot="ombra-album-header"
          className="flex touch-none items-center gap-1 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-2 pl-[max(0.75rem,env(safe-area-inset-left))]"
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <OmbraTitle className="truncate text-base font-medium">{title}</OmbraTitle>
            <OmbraCounter className="font-mono text-xs whitespace-nowrap text-(--ombra-ink)/70 tabular-nums">
              {({ position, count }) => `${position} of ${count}`}
            </OmbraCounter>
          </div>
          <OmbraPrevious aria-label="Previous photo">
            <Chevron direction="left" />
          </OmbraPrevious>
          <OmbraNext aria-label="Next photo">
            <Chevron direction="right" />
          </OmbraNext>
          <OmbraClose aria-label="Close album">
            <CloseIcon />
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
                <OmbraMedia
                  width={photo.width}
                  height={photo.height}
                  className="group/media rounded-[6px] data-[status=error]:bg-(--ombra-ink)/5"
                >
                  {/* `<picture>` lays out as its image, so the image fills the media itself. */}
                  <Picture
                    photo={photo}
                    sizes="100vw"
                    className="h-full w-full rounded-[6px] object-contain group-data-[status=error]/media:opacity-0"
                  />
                  {/* A failed photo keeps its box, and the viewer stays usable around it. */}
                  <span
                    data-slot="ombra-media-fallback"
                    className="absolute inset-0 hidden items-center justify-center p-4 text-center text-sm text-(--ombra-ink)/70 group-data-[status=error]/media:flex"
                  >
                    This photo could not load.
                  </span>
                </OmbraMedia>
              </div>
              <OmbraChrome className="w-full pt-3 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]">
                <OmbraCaption described={photo.id === active?.id && Boolean(photo.caption)}>
                  {photo.caption}
                </OmbraCaption>
              </OmbraChrome>
            </OmbraSlide>
          ))}
        </OmbraSlides>
      </div>
    </>
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
