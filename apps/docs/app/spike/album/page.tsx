import { OmbraAlbum } from "../../../../../registry/ombra/ombra-album";
import type { OmbraAlbumPhoto } from "../../../../../registry/ombra/ombra-album";

import { photos } from "../photos";

// The `<picture>` offers each photo's own WebP or JPEG set; the image keeps the 1600px file.
const album: OmbraAlbumPhoto[] = photos.slice(0, 5).map((photo) => ({
  id: photo.id,
  alt: photo.alt,
  caption: photo.caption,
  width: photo.width,
  height: photo.height,
  src: photo.src,
  sources: [
    { srcSet: photo.srcSet, type: photo.src.endsWith(".webp") ? "image/webp" : "image/jpeg" },
  ],
}));

/**
 * Test bench for the album recipe: a standalone trigger, a custom header holding every
 * control, `<picture>` media, and no thumbnail strip or zoom, from the gallery's parts.
 */
export default function AlbumPage() {
  return (
    <main className="mx-auto grid w-full max-w-xl gap-6 px-4 py-12">
      <h1 className="text-2xl text-foreground">Album recipe</h1>
      <OmbraAlbum title="Coast and city" photos={album} />
    </main>
  );
}
