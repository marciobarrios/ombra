import { OmbraBento } from "@/components/ombra/ombra-bento";
import { OmbraGallery } from "@/components/ombra/ombra-gallery";
import type { OmbraGalleryItem } from "@/components/ombra/ombra-gallery";

// Past five photos, the last tile reads "+N" and opens the first photo without a tile.
export function TripPhotos({ photos }: { photos: readonly OmbraGalleryItem[] }) {
  return (
    <OmbraGallery items={photos}>
      <OmbraBento className="max-w-2xl" />
    </OmbraGallery>
  );
}
