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

/** Keys the type declares without `?`. */
type RequiredKey<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? never : K;
}[keyof T];

type ListedRequired<Entries extends readonly { name: string }[]> = Extract<
  Entries[number],
  { required: true }
>["name"];

/** Keys marked required in the docs but optional in the type, or the other way round. */
type RequiredMismatch<T, Entries extends readonly { name: string }[]> =
  | Exclude<RequiredKey<T>, ListedRequired<Entries>>
  | Exclude<ListedRequired<Entries>, RequiredKey<T>>;

type GalleryRequiredMismatch = RequiredMismatch<OmbraGalleryProps, typeof galleryProps>;

export const galleryRequiredMarked: [GalleryRequiredMismatch] extends [never]
  ? true
  : GalleryRequiredMismatch = true;

type GalleryItemRequiredMismatch = RequiredMismatch<OmbraGalleryItem, typeof galleryItemFields>;

export const galleryItemRequiredMarked: [GalleryItemRequiredMismatch] extends [never]
  ? true
  : GalleryItemRequiredMismatch = true;
