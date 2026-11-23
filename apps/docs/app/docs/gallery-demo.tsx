import { OmbraGallery } from "../../../../registry/ombra/ombra-gallery";
import { photos } from "../spike/photos";

const demo = photos.slice(0, 4);

export function GalleryDemo() {
  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl">Gallery</h2>
      <p className="mt-2 text-sm leading-6 text-foreground/70">
        The gallery recipe, opened from these four photos.
      </p>
      <div className="mt-6">
        <OmbraGallery items={demo} />
      </div>
    </section>
  );
}
