import { OmbraAlbum } from "@/components/ombra/ombra-album";
import type { OmbraAlbumPhoto } from "@/components/ombra/ombra-album";
import { OmbraBento } from "@/components/ombra/ombra-bento";
import { OmbraGallery } from "@/components/ombra/ombra-gallery";
import type { OmbraGalleryItem } from "@/components/ombra/ombra-gallery";
import { OmbraMosaic } from "@/components/ombra/ombra-mosaic";

import { photos } from "./photos";

const items: readonly OmbraGalleryItem[] = photos.map((photo) => ({
  ...photo,
  // The grid's crop. The viewer always shows the full frame.
  frame: `${photo.width} / ${photo.height}`,
}));

const album: readonly OmbraAlbumPhoto[] = photos.map((photo) => ({
  ...photo,
  sources: [{ srcSet: photo.srcSet, type: "image/jpeg" }],
}));

export function GalleryRecipe() {
  return <OmbraGallery items={items} />;
}

// Three tiles for four photos, so the last one reads "+2".
export function BentoRecipe() {
  return (
    <OmbraGallery items={items}>
      <OmbraBento max={3} />
    </OmbraGallery>
  );
}

export function MosaicRecipe() {
  return (
    <OmbraGallery items={items}>
      <OmbraMosaic />
    </OmbraGallery>
  );
}

export function AlbumRecipe() {
  return <OmbraAlbum title="Four landscapes" photos={album} className="max-w-md" />;
}
