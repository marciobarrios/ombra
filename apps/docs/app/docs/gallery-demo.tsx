import { OmbraBento } from "../../../../registry/ombra/ombra-bento";
import { OmbraGallery } from "../../../../registry/ombra/ombra-gallery";
import { OmbraMosaic } from "../../../../registry/ombra/ombra-mosaic";
import { PhotoCredit } from "../photo-credit";
import { photos } from "../spike/photos";

const demos = {
  ombra: { intro: "The gallery recipe, opened from these four photos.", count: 4 },
  "ombra-bento": {
    intro: "The gallery recipe in the bento layout: eight photos in five tiles.",
    count: 8,
  },
  "ombra-mosaic": {
    intro: "The gallery recipe in the mosaic layout, opened from these ten photos.",
    count: 10,
  },
} as const;

export type GalleryDemoItem = keyof typeof demos;

export function hasGalleryDemo(item: string): item is GalleryDemoItem {
  return item in demos;
}

export function GalleryDemo({ item = "ombra" }: { item?: GalleryDemoItem }) {
  const { intro, count } = demos[item];

  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl">Gallery</h2>
      <p className="mt-2 text-sm leading-6 text-foreground/70">{intro}</p>
      <div className="mt-6">
        <OmbraGallery items={photos.slice(0, count)}>
          {item === "ombra-bento" ? (
            <OmbraBento />
          ) : item === "ombra-mosaic" ? (
            <OmbraMosaic />
          ) : null}
        </OmbraGallery>
      </div>
      <PhotoCredit />
    </section>
  );
}
