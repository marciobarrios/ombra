export type SurfaceNote = {
  name: string;
  /** The TypeScript type as a reader should see it. Written out by hand. */
  type: string;
  /** The value used when the prop is left out, as TypeScript source. */
  default?: string;
  /** The type has no `?` on this key. `examples/surface-coverage.ts` checks it. */
  required?: true;
  note: string;
};

const morphEngine = '"flip" | "vt" | "fade"';

/** Names and notes for `OmbraGalleryProps`. `examples/surface-coverage.ts` checks the names. */
export const galleryProps = [
  {
    name: "items",
    type: "readonly OmbraGalleryItem[]",
    required: true,
    note: "Photos, in navigation order. Each one needs every field listed under Item fields.",
  },
  {
    name: "thumbnails",
    type: "boolean",
    default: "true",
    note: "Shows the thumbnail strip under the photo. A gallery of one photo never shows it.",
  },
  { name: "className", type: "string", note: "Class on the gallery root." },
  {
    name: "morph",
    type: morphEngine,
    default: '"flip"',
    note: "How the photo travels between the thumbnail and the viewer. A browser without View Transitions runs FLIP for vt, and reduced motion always fades.",
  },
  {
    name: "open",
    type: "boolean",
    note: "Controlled open state. A closing viewer already counts as closed.",
  },
  {
    name: "defaultOpen",
    type: "boolean",
    default: "false",
    note: "Initial open state when open is left uncontrolled.",
  },
  {
    name: "onOpenChange",
    type: "(open: boolean) => void",
    note: "The viewer asks to open or close. A controlled parent may ignore the request.",
  },
  { name: "activeId", type: "string | null", note: "Controlled active item id." },
  {
    name: "defaultActiveId",
    type: "string | null",
    default: "null",
    note: "Initial active item when activeId is left uncontrolled.",
  },
  {
    name: "onActiveIdChange",
    type: "(itemId: string) => void",
    note: "The viewer asks to show another item. A controlled parent may ignore the request.",
  },
] as const satisfies readonly SurfaceNote[];

/** Names and notes for `OmbraGalleryItem`. Checked the same way as the gallery props. */
export const galleryItemFields = [
  {
    name: "id",
    type: "string",
    required: true,
    note: "Stable identity. A reorder keeps the open photo open.",
  },
  {
    name: "alt",
    type: "string",
    required: true,
    note: "Accessible name of the photo. The viewer uses it as the dialog name.",
  },
  { name: "caption", type: "string", required: true, note: "Text under the photo in the viewer." },
  { name: "width", type: "number", required: true, note: "Intrinsic width in pixels." },
  { name: "height", type: "number", required: true, note: "Intrinsic height in pixels." },
  {
    name: "frame",
    type: "string",
    required: true,
    note: 'CSS aspect-ratio of the thumbnail, such as "3 / 2".',
  },
  { name: "src", type: "string", required: true, note: "Full-size image URL." },
  {
    name: "thumbSrc",
    type: "string",
    required: true,
    note: "Thumbnail URL. The trigger image uses object-cover inside frame.",
  },
  {
    name: "srcSet",
    type: "string",
    required: true,
    note: "Full-size srcset. The viewer swaps to it once the image has decoded.",
  },
] as const satisfies readonly SurfaceNote[];

/**
 * Parameter order of `resolveMorphEngine`. The coverage file checks the length against the
 * function, and the usage example in `examples/ombra-morph.tsx` is the call that typechecks.
 */
export const morphParams = [
  {
    name: "requested",
    type: morphEngine,
    required: true,
    note: "The engine the caller asked for.",
  },
  {
    name: "reduced",
    type: "boolean",
    required: true,
    note: "True when the user prefers reduced motion. The result is then fade.",
  },
] as const satisfies readonly SurfaceNote[];

/**
 * Parameter order of `useZoom`. Leave spring and slow false: they are spike experiments, and
 * the product easing is the cubic curve. The coverage file checks this list's length.
 */
export const zoomParams = [
  {
    name: "trackRef",
    type: "RefObject<HTMLElement | null>",
    required: true,
    note: "The slide track element.",
  },
  {
    name: "layerRef",
    type: "RefObject<HTMLElement | null>",
    required: true,
    note: "The element that scales.",
  },
  {
    name: "enabled",
    type: "boolean",
    required: true,
    note: "False leaves the photo at its fitted size.",
  },
  {
    name: "onSettled",
    type: "() => void",
    required: true,
    note: "Called when a zoom gesture finishes.",
  },
  { name: "spring", type: "boolean", required: true, note: "Spike experiment. Pass false." },
  { name: "slow", type: "boolean", required: true, note: "Spike experiment. Pass false." },
  {
    name: "reduced",
    type: "boolean",
    required: true,
    note: "True when the user prefers reduced motion.",
  },
  {
    name: "gestureRef",
    type: "RefObject<boolean>",
    required: true,
    note: "Set true while a zoom gesture owns the pointer.",
  },
] as const satisfies readonly SurfaceNote[];
