import { resolveMorphEngine } from "@/components/ombra/morph";
import type { OmbraGalleryItem, OmbraGalleryProps } from "@/components/ombra/ombra-gallery";
import { useZoom } from "@/components/ombra/use-zoom";

import { galleryItemFields, galleryProps, morphParams, zoomParams } from "../lib/item-surface";

export const galleryPropNamesChecked = galleryProps satisfies readonly {
  name: keyof OmbraGalleryProps;
  note: string;
}[];

type MissingGalleryProp = Exclude<keyof OmbraGalleryProps, (typeof galleryProps)[number]["name"]>;

export const galleryPropsCovered: MissingGalleryProp extends never ? true : MissingGalleryProp =
  true;

export const galleryItemFieldsChecked = galleryItemFields satisfies readonly {
  name: keyof OmbraGalleryItem;
  note: string;
}[];

type MissingGalleryItemField = Exclude<
  keyof OmbraGalleryItem,
  (typeof galleryItemFields)[number]["name"]
>;

export const galleryItemFieldsCovered: MissingGalleryItemField extends never
  ? true
  : MissingGalleryItemField = true;

export const morphParamCount = morphParams.length satisfies Parameters<
  typeof resolveMorphEngine
>["length"];

export const zoomParamCount = zoomParams.length satisfies Parameters<typeof useZoom>["length"];
