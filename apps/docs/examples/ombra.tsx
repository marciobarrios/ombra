import { OmbraGallery } from "@/components/ombra/ombra-gallery";
import type { OmbraGalleryItem } from "@/components/ombra/ombra-gallery";

const harbor =
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80";

const photos: readonly OmbraGalleryItem[] = [
  {
    id: "harbor",
    alt: "A harbor at dusk",
    caption: "Harbor",
    width: 1600,
    height: 1067,
    frame: "3 / 2",
    src: harbor,
    thumbSrc: harbor,
    srcSet: `${harbor} 1600w`,
  },
];

export function Gallery() {
  return <OmbraGallery items={photos} />;
}
