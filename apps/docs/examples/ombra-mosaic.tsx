import { OmbraGallery } from "@/components/ombra/ombra-gallery";
import type { OmbraGalleryItem } from "@/components/ombra/ombra-gallery";
import { OmbraMosaic } from "@/components/ombra/ombra-mosaic";

// Each photo's `frame` sets its tile's shape; the rows fill the width.
export function PhotoWall({ photos }: { photos: readonly OmbraGalleryItem[] }) {
  return (
    <OmbraGallery items={photos}>
      <OmbraMosaic className="[--ombra-row-height:10rem]" />
    </OmbraGallery>
  );
}
