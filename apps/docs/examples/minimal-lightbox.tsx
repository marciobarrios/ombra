import {
  OmbraBackdrop,
  OmbraClose,
  OmbraContent,
  OmbraPortal,
} from "@/components/ombra/ombra-dialog";
import { OmbraRoot } from "@/components/ombra/ombra-root";
import { OmbraMedia, OmbraSlide, OmbraSlides } from "@/components/ombra/ombra-slides";
import { OmbraTrigger } from "@/components/ombra/ombra-trigger";

import { photos } from "./photos";

export function MinimalLightbox() {
  return (
    <OmbraRoot itemIds={photos.map((photo) => photo.id)}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((photo) => (
          <OmbraTrigger
            key={photo.id}
            itemId={photo.id}
            className="block aspect-square overflow-hidden rounded-md"
          >
            <img
              src={photo.thumbSrc}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              className="size-full object-cover"
            />
          </OmbraTrigger>
        ))}
      </div>

      <OmbraPortal>
        <OmbraBackdrop />
        <OmbraContent aria-label="Photos">
          <header className="flex justify-end p-3">
            <OmbraClose aria-label="Close">×</OmbraClose>
          </header>
          <div className="min-h-0 flex-1 pb-3">
            <OmbraSlides>
              {photos.map((photo) => (
                <OmbraSlide key={photo.id} itemId={photo.id} aria-label={photo.alt}>
                  <OmbraMedia width={photo.width} height={photo.height}>
                    <img
                      src={photo.src}
                      alt=""
                      width={photo.width}
                      height={photo.height}
                      draggable={false}
                    />
                  </OmbraMedia>
                </OmbraSlide>
              ))}
            </OmbraSlides>
          </div>
        </OmbraContent>
      </OmbraPortal>
    </OmbraRoot>
  );
}
