export type SurfaceNote = {
  name: string;
  note: string;
};

/** Names and notes for `OmbraGalleryProps`. `examples/surface-coverage.ts` checks the names. */
export const galleryProps = [
  {
    name: "items",
    note: "Photos. Each one needs id, alt, caption, width, height, frame, src, thumbSrc and srcSet.",
  },
  { name: "className", note: "Class on the gallery root." },
  {
    name: "morph",
    note: '"flip" (the default), "vt", or "fade". Reduced motion forces fade.',
  },
  { name: "open", note: "Controlled open state. A closing viewer already counts as closed." },
  { name: "defaultOpen", note: "Initial open state when open is left uncontrolled." },
  {
    name: "onOpenChange",
    note: "The viewer asks to open or close. A controlled parent may ignore the request.",
  },
  { name: "activeId", note: "Controlled active item id." },
  { name: "defaultActiveId", note: "Initial active item when activeId is left uncontrolled." },
  {
    name: "onActiveIdChange",
    note: "The viewer asks to show another item. A controlled parent may ignore the request.",
  },
] as const satisfies readonly SurfaceNote[];

/** Names and notes for `OmbraGalleryItem`. Checked the same way as the gallery props. */
export const galleryItemFields = [
  { name: "id", note: "Stable string identity. A reorder keeps the open photo open." },
  { name: "alt", note: "Accessible name of the photo. The viewer uses it as the dialog name." },
  { name: "caption", note: "Text under the photo in the viewer." },
  { name: "width", note: "Intrinsic width in pixels." },
  { name: "height", note: "Intrinsic height in pixels." },
  { name: "frame", note: 'CSS aspect-ratio of the thumbnail, such as "3 / 2".' },
  { name: "src", note: "Full-size image URL." },
  { name: "thumbSrc", note: "Thumbnail URL. The trigger image uses object-cover inside frame." },
  { name: "srcSet", note: "Full-size srcset. The viewer swaps to it once the image has decoded." },
] as const satisfies readonly SurfaceNote[];

/**
 * Parameter order of `resolveMorphEngine`. The coverage file checks the length against the
 * function, and the usage example in `examples/ombra-morph.tsx` is the call that typechecks.
 */
export const morphParams = [
  { name: "requested", note: 'The engine the caller asked for: "flip", "vt", or "fade".' },
  { name: "reduced", note: "True when the user prefers reduced motion. The result is then fade." },
] as const satisfies readonly SurfaceNote[];

/**
 * Parameter order of `useZoom`. Leave spring and slow false: they are spike experiments, and
 * the product easing is the cubic curve. The coverage file checks this list's length.
 */
export const zoomParams = [
  { name: "trackRef", note: "The slide track element." },
  { name: "layerRef", note: "The element that scales." },
  { name: "enabled", note: "False leaves the photo at its fitted size." },
  { name: "onSettled", note: "Called when a zoom gesture finishes." },
  { name: "spring", note: "Spike experiment. Leave false." },
  { name: "slow", note: "Spike experiment. Leave false." },
  { name: "reduced", note: "True when the user prefers reduced motion." },
  { name: "gestureRef", note: "Set true while a zoom gesture owns the pointer." },
] as const satisfies readonly SurfaceNote[];
