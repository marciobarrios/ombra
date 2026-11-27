// The public API as the docs describe it. Plain data with no imports, so
// `tools/api-types/generate.ts` can read it with Node and write the type checks that
// `pnpm typecheck` runs against the registry source.

export type SurfaceNote = {
  name: string;
  /** The TypeScript type as a reader should see it. `pnpm typecheck` compares it with the source. */
  type: string;
  /** The value used when the prop is left out, as TypeScript source. Checked against `type`. */
  default?: string;
  /** The type has no `?` on this key. Checked too. */
  required?: true;
  note: string;
};

/** A table of an object type's keys, such as a part's props or a hook's return value. */
export type ObjectTable = {
  kind: "object";
  title: "Props" | "Returns" | "Item fields" | "Photo fields";
  /** The TypeScript type the table describes. */
  of: string;
  /**
   * Props the part passes through, as a TypeScript type. The table lists every key the part
   * adds; without a base it lists every key of `of`.
   */
  base?: string;
  entries: readonly SurfaceNote[];
};

/** A function's parameters, in order. */
export type ParameterTable = {
  kind: "parameters";
  title: "Parameters";
  /** The function's exported name. */
  of: string;
  entries: readonly SurfaceNote[];
};

export type ApiTable = ObjectTable | ParameterTable;

/** A `data-*` attribute or CSS variable a part sets. The registry source must contain its name. */
export type ApiHook = { name: string; note: string };

export type ApiPart = {
  name: string;
  /** The registry item that installs it. */
  item: "ombra" | "ombra-morph" | "ombra-zoom";
  /** Its file under `components/ombra`. */
  file: string;
  /** What it does. Backticks render as code. */
  summary: string;
  /** The element it renders, or what it renders instead. */
  renders: string;
  /** Its `data-slot`. The registry source must contain it. */
  slot?: string;
  tables: readonly ApiTable[];
  /** A function's return type when it is not an object worth a table. Checked. */
  returns?: string;
  dataAttributes?: readonly ApiHook[];
  cssVariables?: readonly ApiHook[];
};

export type ApiGroup = { id: string; title: string; intro: string; parts: readonly ApiPart[] };

const morphEngine = '"flip" | "vt" | "fade"';

/** The root's props without `children` and `itemIds`, which the recipes pass for you. */
const rootBase = 'Omit<OmbraRootProps, "children" | "itemIds">';

const buttonBase = 'useRender.ComponentProps<"button">';

const divBase = 'useRender.ComponentProps<"div">';

const renderNote =
  "Takes every prop of its element, plus Base UI's `render` to swap the element and a `className` that may be a function of the part's state.";

/** `OmbraRoot` and the recipes that wrap it share these. */
const rootProps = [
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
    note: "The viewer asks to open or close. A controlled parent may ignore the request, or answer within about a second.",
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

/** Props of `OmbraGallery`, the item page's first table. */
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
  ...rootProps,
] as const satisfies readonly SurfaceNote[];

/** Fields of `OmbraGalleryItem`. */
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

/** Parameters of `resolveMorphEngine`, in order. `examples/ombra-morph.tsx` is a call that typechecks. */
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
 * Parameters of `useZoom`, in order. Leave spring and slow false: they are spike experiments,
 * and the product easing is the cubic curve.
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
  {
    name: "pullingRef",
    type: "RefObject<boolean>",
    note: "True while a pull to dismiss owns the pointer. A pinch then waits. Without it, nothing pulls.",
  },
  {
    name: "restedRef",
    type: "RefObject<boolean>",
    note: "False while the track is between two slides. A pinch waits until it rests. Without it, the track always counts as rested.",
  },
  {
    name: "limitRef",
    type: "RefObject<ZoomLimit | null>",
    note: "The media and natural width that set the zoom ceiling. Without it, zoom stops at 4×.",
  },
] as const satisfies readonly SurfaceNote[];

const zoomReturns = [
  {
    name: "zoomed",
    type: "boolean",
    required: true,
    note: "Whether the photo rests above its fitted size.",
  },
  { name: "zoomIn", type: "() => void", required: true, note: "Zooms in one step." },
  { name: "zoomOut", type: "() => void", required: true, note: "Zooms out one step." },
  {
    name: "reset",
    type: "() => void",
    required: true,
    note: "Returns to the fitted size at once, with no animation.",
  },
  {
    name: "home",
    type: "() => void",
    required: true,
    note: "Returns to the fitted size with the zoom animation, as the `0` key does.",
  },
] as const satisfies readonly SurfaceNote[];

const disabledAttribute: ApiHook = {
  name: "data-disabled",
  note: "Present while the button is disabled.",
};

/** Every public part, in the order the API reference shows them. */
export const apiGroups: readonly ApiGroup[] = [
  {
    id: "state",
    title: "State",
    intro: "The root owns the open state and the active item. Everything else reads it.",
    parts: [
      {
        name: "OmbraRoot",
        item: "ombra",
        file: "ombra-root.tsx",
        summary:
          "Coordinates the open state, the active item and the morph lifecycle, controlled or not. It renders Base UI's dialog root, so the parts inside need no dialog root of their own. Items are identified by stable string IDs, never by index.",
        renders: "No element.",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraRootProps",
            entries: [
              { name: "children", type: "ReactNode", note: "The triggers and the portal." },
              {
                name: "itemIds",
                type: "readonly string[]",
                note: "The collection, in navigation order. The slides mount only with the viewer, so a closed viewer learns what it can open on from here.",
              },
              ...rootProps,
            ],
          },
        ],
      },
      {
        name: "useOmbraState",
        item: "ombra",
        file: "ombra-root.tsx",
        summary:
          "The viewer's state, for captions, titles and announcements you render around the parts. Throws outside an `OmbraRoot`.",
        renders: "A hook. It takes no arguments.",
        tables: [
          {
            kind: "object",
            title: "Returns",
            of: "ReturnType<typeof useOmbraState>",
            entries: [
              {
                name: "open",
                type: "boolean",
                required: true,
                note: "True while the viewer is mounted: opening, open or closing.",
              },
              {
                name: "phase",
                type: '"closed" | "opening" | "open" | "closing"',
                required: true,
                note: "Where the viewer is in its open and close lifecycle.",
              },
              {
                name: "activeId",
                type: "string | null",
                required: true,
                note: "The resolved active item, controlled or not.",
              },
              {
                name: "index",
                type: "number",
                required: true,
                note: "The active item's position in itemIds, or -1.",
              },
              {
                name: "itemIds",
                type: "readonly string[]",
                required: true,
                note: "The collection the root was given.",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "trigger",
    title: "Trigger",
    intro:
      "The thumbnail on the page. The open morph flies from it and the close morph lands on it.",
    parts: [
      {
        name: "OmbraTrigger",
        item: "ombra",
        file: "ombra-trigger.tsx",
        summary:
          "Opens its item. Base UI supplies the button semantics, `aria-haspopup`, `aria-expanded` and `aria-controls`; the root decides whether the press opens, so a controlled parent can refuse it. A handler that calls `event.preventBaseUIHandler()` cancels the open. The thumbnail needs a laid-out size, and must not be clipped or sit inside a transformed ancestor.",
        renders: "A `<button>`, through Base UI's `Dialog.Trigger`.",
        slot: "ombra-trigger",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraTriggerProps",
            base: 'Omit<ComponentPropsWithRef<typeof Dialog.Trigger>, "handle" | "payload">',
            entries: [
              {
                name: "itemId",
                type: "string",
                required: true,
                note: "The item this trigger opens. It matches the item's stable ID, not its position.",
              },
              {
                name: "mediaRef",
                type: "RefObject<HTMLElement | null>",
                note: "The thumbnail the morphs fly from and land on. Defaults to the first `<img>` inside the trigger; pass a ref for a picture or a background-image element.",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "dialog-shell",
    title: "Dialog shell",
    intro:
      "Base UI's dialog parts, styled as a full-viewport viewer. Inside an `OmbraRoot` the portal runs the morphs, pull to dismiss, zoom and the keyboard shortcuts.",
    parts: [
      {
        name: "OmbraPortal",
        item: "ombra",
        file: "ombra-dialog.tsx",
        summary:
          "Base UI's portal, including its `container` and `keepMounted` options. Inside an `OmbraRoot` it also runs the viewer, so render one portal per root. It renders the morph's styles beside the dialog, so a closing view transition still has them.",
        renders: "A `<div>` at the end of `document.body`, through Base UI's `Dialog.Portal`.",
        slot: "ombra-portal",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraPortalProps",
            base: "ComponentPropsWithRef<typeof Dialog.Portal>",
            entries: [],
          },
        ],
      },
      {
        name: "OmbraBackdrop",
        item: "ombra",
        file: "ombra-dialog.tsx",
        summary:
          "The full-viewport surface behind the photo. It fades while the viewer is pulled. Base UI's `data-open`, `data-closed`, `data-starting-style` and `data-ending-style` apply too.",
        renders: "A `<div>`, through Base UI's `Dialog.Backdrop`.",
        slot: "ombra-backdrop",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraBackdropProps",
            base: "ComponentPropsWithRef<typeof Dialog.Backdrop>",
            entries: [],
          },
        ],
        cssVariables: [
          {
            name: "--ombra-pull",
            note: "Signed pull progress, -1 to 1. Negative while the photo is pushed up.",
          },
          {
            name: "--ombra-surface",
            note: "The viewer's background. Defaults to the page's `--color-background`, so Safari's bars match it.",
          },
          {
            name: "--ombra-ink",
            note: "The viewer's text and icon colour. Defaults to the page's `--color-foreground`.",
          },
        ],
      },
      {
        name: "OmbraContent",
        item: "ombra",
        file: "ombra-dialog.tsx",
        summary:
          "The dialog: a full-viewport shell whose header, media, controls and labels are yours. Name it with `aria-label` or an `OmbraTitle` inside. Focus starts on the first enabled `OmbraClose` without scrolling the page. Your `onKeyDown` runs before the viewer's shortcuts, so preventing a key replaces its shortcut. The state attributes and variables below need an `OmbraRoot`; Base UI's `data-open` and `data-closed` apply too.",
        renders: 'A `<div role="dialog">`, through Base UI\'s `Dialog.Popup`.',
        slot: "ombra-content",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraContentProps",
            base: "ComponentPropsWithRef<typeof Dialog.Popup>",
            entries: [],
          },
        ],
        dataAttributes: [
          {
            name: "data-phase",
            note: "`closed`, `opening`, `open` or `closing`.",
          },
          {
            name: "data-engine",
            note: "The morph that runs: `flip`, `vt` or `fade`, after reduced motion and browser support.",
          },
          {
            name: "data-chrome",
            note: "`shown` or `hidden`. A tap on the photo toggles it, and the registry CSS fades every `OmbraChrome` while it is hidden.",
          },
          {
            name: "data-zoomed",
            note: "`true` while the active photo rests above its fitted size.",
          },
          { name: "data-pulling", note: "`true` while a pull to dismiss owns the gesture." },
        ],
        cssVariables: [
          {
            name: "--ombra-pull",
            note: "Signed pull progress, -1 to 1. Negative while the photo is pushed up. It reads a live value, so a drag re-renders nothing.",
          },
          {
            name: "--ombra-zoom",
            note: "The active photo's scale, 1 at its fitted size. The zoom gesture writes it.",
          },
          { name: "--ombra-surface", note: "The viewer's background, as on the backdrop." },
          { name: "--ombra-ink", note: "The viewer's text and icon colour, as on the backdrop." },
        ],
      },
      {
        name: "OmbraChrome",
        item: "ombra",
        file: "ombra-dialog.tsx",
        summary:
          "A region of controls a tap on the photo hides and a second tap shows. While hidden it stays in the tab order, and focus inside it shows it again. The registry CSS fades it without changing its box, so the photo does not move.",
        renders: "A `<div>`.",
        slot: "ombra-chrome",
        tables: [
          { kind: "object", title: "Props", of: "OmbraChromeProps", base: divBase, entries: [] },
        ],
      },
      {
        name: "OmbraClose",
        item: "ombra",
        file: "ombra-dialog.tsx",
        summary:
          "Closes the viewer. Supply visible text or `aria-label` in your language. The viewer focuses the first enabled one when it opens.",
        renders: "A `<button>`, through Base UI's `Dialog.Close`.",
        slot: "ombra-close",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraCloseProps",
            base: "ComponentPropsWithRef<typeof Dialog.Close>",
            entries: [],
          },
        ],
      },
      {
        name: "OmbraTitle",
        item: "ombra",
        file: "ombra-dialog.tsx",
        summary:
          "The dialog's name: the popup's `aria-labelledby` points at it. Add `sr-only` to name the dialog without showing the text.",
        renders: "An `<h2>`, through Base UI's `Dialog.Title`.",
        slot: "ombra-title",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraTitleProps",
            base: "ComponentPropsWithRef<typeof Dialog.Title>",
            entries: [],
          },
        ],
      },
    ],
  },
  {
    id: "slides",
    title: "Slides",
    intro:
      "A native scroll-snap track of one slide per item. The media inside each slide is the box the morph lands on.",
    parts: [
      {
        name: "OmbraSlides",
        item: "ombra",
        file: "ombra-slides.tsx",
        summary:
          'The scroll-snap track. The active item follows the slide nearest the centre as it scrolls. It is named "Photos" unless you pass `aria-label` or `aria-labelledby`, and it holds a polite live region that announces each slide it rests on.',
        renders: 'A `<div role="region" aria-roledescription="carousel">`.',
        slot: "ombra-track",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraSlidesProps",
            base: divBase,
            entries: [
              {
                name: "announce",
                type: "(itemId: string, position: number, count: number) => string",
                note: "The announcement for the slide the track rests on. `position` is one-based. Without it, the text is `Image N of M`.",
              },
            ],
          },
        ],
      },
      {
        name: "OmbraSlide",
        item: "ombra",
        file: "ombra-slides.tsx",
        summary:
          "One item's snap box and a size container for the media. Only the active slide is exposed to assistive technology. Never transform the slide itself: browsers take snap positions from the transformed box. Animate its children instead.",
        renders: 'A `<div role="group" aria-roledescription="slide">`.',
        slot: "ombra-slide",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraSlideProps",
            base: divBase,
            entries: [
              {
                name: "itemId",
                type: "string",
                required: true,
                note: "The item this slide shows. It matches the trigger's itemId.",
              },
            ],
          },
        ],
        dataAttributes: [
          { name: "data-active", note: "`true` on the active slide, `false` on the rest." },
        ],
      },
      {
        name: "OmbraMedia",
        item: "ombra",
        file: "ombra-slides.tsx",
        summary:
          "The full-size media the morph lands on. It takes the largest box of its ratio that fits its parent's size container, centred. Any image renderer inside works: `img`, `picture`, Next.js `Image`. Beside a caption, give it a parent of its own with `container-type: size`.",
        renders: "A `<div>`. Throws outside an `OmbraSlide`.",
        slot: "ombra-media",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraMediaProps",
            base: divBase,
            entries: [
              {
                name: "width",
                type: "number",
                required: true,
                note: "Intrinsic width, in any unit that shares a ratio with height. Zoom stops where the media shows at this width.",
              },
              { name: "height", type: "number", required: true, note: "Intrinsic height." },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "zoom",
    title: "Zoom",
    intro: "Only a slide with an `OmbraZoom` zooms. The buttons drive the active slide's zoom.",
    parts: [
      {
        name: "OmbraZoom",
        item: "ombra",
        file: "ombra-zoom.tsx",
        summary:
          "Makes its slide's media zoomable: pinch, double-tap, ctrl+wheel, trackpad pinch and the `+`, `-` and `0` keys. Wrap the `OmbraMedia`: zoom scales this surface, never the media's resting box. The first zoom past the fitted size raises the `sizes` of each `img[srcset]` inside, so the browser fetches a sharper file.",
        renders: "A `<div>`. Throws outside an `OmbraSlide`.",
        slot: "ombra-zoom",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraZoomProps",
            base: divBase,
            entries: [
              {
                name: "maxScale",
                type: "number",
                note: "The largest scale, relative to the fitted media. Without it, zoom stops where the media shows at its natural size, and media that already fits at that size does not zoom.",
              },
            ],
          },
        ],
      },
      {
        name: "OmbraZoomIn",
        item: "ombra",
        file: "ombra-zoom.tsx",
        summary:
          "Zooms the active photo in one step. Disabled while the active slide has no `OmbraZoom`. Supply visible text or `aria-label`.",
        renders: "A `<button>`.",
        slot: "ombra-zoom-in",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraZoomActionProps",
            base: buttonBase,
            entries: [],
          },
        ],
        dataAttributes: [disabledAttribute],
      },
      {
        name: "OmbraZoomOut",
        item: "ombra",
        file: "ombra-zoom.tsx",
        summary:
          "Zooms the active photo out one step. Disabled while it rests at its fitted size. Supply visible text or `aria-label`.",
        renders: "A `<button>`.",
        slot: "ombra-zoom-out",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraZoomActionProps",
            base: buttonBase,
            entries: [],
          },
        ],
        dataAttributes: [disabledAttribute],
      },
      {
        name: "OmbraZoomReset",
        item: "ombra",
        file: "ombra-zoom.tsx",
        summary:
          "Returns the active photo to its fitted size, as the `0` key does. Disabled while it already rests there. Supply visible text or `aria-label`.",
        renders: "A `<button>`.",
        slot: "ombra-zoom-reset",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraZoomActionProps",
            base: buttonBase,
            entries: [],
          },
        ],
        dataAttributes: [disabledAttribute],
      },
    ],
  },
  {
    id: "controls",
    title: "Controls",
    intro: `Optional parts that read and move the active item. ${renderNote} The caller's \`onClick\` runs first and may call \`event.preventBaseUIHandler()\` to cancel the action.`,
    parts: [
      {
        name: "OmbraPrevious",
        item: "ombra",
        file: "ombra-controls.tsx",
        summary:
          "Goes to the previous item, resetting zoom first. Disabled on the first. Supply visible text or `aria-label`.",
        renders: "A `<button>`.",
        slot: "ombra-previous",
        tables: [
          { kind: "object", title: "Props", of: "OmbraActionProps", base: buttonBase, entries: [] },
        ],
        dataAttributes: [disabledAttribute],
      },
      {
        name: "OmbraNext",
        item: "ombra",
        file: "ombra-controls.tsx",
        summary:
          "Goes to the next item, resetting zoom first. Disabled on the last. Supply visible text or `aria-label`.",
        renders: "A `<button>`.",
        slot: "ombra-next",
        tables: [
          { kind: "object", title: "Props", of: "OmbraActionProps", base: buttonBase, entries: [] },
        ],
        dataAttributes: [disabledAttribute],
      },
      {
        name: "OmbraCounter",
        item: "ombra",
        file: "ombra-controls.tsx",
        summary: "The active item's position. Without children it shows `1 / 12` in digits.",
        renders: "A `<span>`.",
        slot: "ombra-counter",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraCounterProps",
            base: 'Omit<useRender.ComponentProps<"span", OmbraCounterState>, "children">',
            entries: [
              {
                name: "children",
                type: "(state: OmbraCounterState) => ReactNode",
                note: "Formats the text. The state has `activeId`, `index` (zero-based), `position` (one-based, 0 with no active item) and `count`.",
              },
            ],
          },
        ],
        dataAttributes: [
          { name: "data-position", note: "The one-based position, or 0." },
          { name: "data-count", note: "The number of items." },
        ],
      },
      {
        name: "OmbraThumbnails",
        item: "ombra",
        file: "ombra-controls.tsx",
        summary:
          "The thumbnail strip: a horizontal scroller around `OmbraThumbnail`s. It keeps the active thumbnail in view, snaps once the thumbnails overflow, and fades an edge cue in at each end with more beyond. Name it with `aria-label`. With fewer than two items it renders nothing.",
        renders:
          'A `<nav>` inside a `<div data-slot="ombra-thumbnails-frame">`. The children go in a `<div data-slot="ombra-thumbnails-row">`.',
        slot: "ombra-thumbnails",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraThumbnailsProps",
            base: 'useRender.ComponentProps<"nav", OmbraThumbnailsState>',
            entries: [],
          },
        ],
        dataAttributes: [
          {
            name: "data-overflowing",
            note: "`true` once the thumbnails are wider than the strip.",
          },
        ],
      },
      {
        name: "OmbraThumbnail",
        item: "ombra",
        file: "ombra-controls.tsx",
        summary:
          "Goes to its item. It carries `aria-current` while that item is active. Supply `aria-label` or visible text.",
        renders: "A `<button>`.",
        slot: "ombra-thumbnail",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraThumbnailProps",
            base: 'useRender.ComponentProps<"button", OmbraThumbnailState>',
            entries: [
              {
                name: "itemId",
                type: "string",
                required: true,
                note: "The item this thumbnail goes to. It matches the slide's and the trigger's itemId.",
              },
            ],
          },
        ],
        dataAttributes: [
          { name: "data-active", note: "`true` while its item is active, `false` otherwise." },
        ],
      },
      {
        name: "OmbraCaption",
        item: "ombra",
        file: "ombra-caption.tsx",
        summary:
          "The active photo's caption, one line tall so a longer one is cut with an ellipsis instead of pushing the photo. It is the dialog's description unless `described` is false.",
        renders: "A `<div>`, through Base UI's `Dialog.Description` while described.",
        slot: "ombra-caption",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraCaptionProps",
            base: 'Omit<ComponentPropsWithRef<"div">, "children">',
            entries: [
              { name: "children", type: "ReactNode", note: "Text or any node." },
              {
                name: "described",
                type: "boolean",
                default: "true",
                note: "Makes this caption the dialog's description. A second visible copy, such as one on an inactive slide, passes false: a dialog has one description.",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "recipes",
    title: "Recipes",
    intro:
      "Lightboxes already written from the parts. They are files in your project: edit the JSX to move, replace or leave out a part.",
    parts: [
      {
        name: "OmbraGallery",
        item: "ombra",
        file: "ombra-gallery.tsx",
        summary:
          "A grid of thumbnails that opens a viewer with zoom, previous and next, a counter, a caption, a thumbnail strip and chrome.",
        renders: 'A `<div data-slot="ombra-root">` holding the grid, and the viewer in a portal.',
        tables: [
          { kind: "object", title: "Props", of: "OmbraGalleryProps", entries: galleryProps },
          {
            kind: "object",
            title: "Item fields",
            of: "OmbraGalleryItem",
            entries: galleryItemFields,
          },
        ],
      },
      {
        name: "OmbraAlbum",
        item: "ombra",
        file: "ombra-album.tsx",
        summary:
          "One cover that opens the whole album. The header holds the title and every control, the photos render through `<picture>`, and there is no thumbnail strip or zoom.",
        renders:
          "The cover's `OmbraTrigger` button, and the viewer in a portal. Nothing without photos.",
        tables: [
          {
            kind: "object",
            title: "Props",
            of: "OmbraAlbumProps",
            base: rootBase,
            entries: [
              {
                name: "title",
                type: "string",
                required: true,
                note: "The album's name: the cover's label and the viewer's visible title.",
              },
              {
                name: "photos",
                type: "readonly OmbraAlbumPhoto[]",
                required: true,
                note: "The first photo is the cover. Each one takes the fields listed under Photo fields.",
              },
              { name: "className", type: "string", note: "Class on the cover." },
            ],
          },
          {
            kind: "object",
            title: "Photo fields",
            of: "OmbraAlbumPhoto",
            entries: [
              { name: "id", type: "string", required: true, note: "Stable identity." },
              {
                name: "alt",
                type: "string",
                required: true,
                note: "Accessible name of the photo, used as its slide's name.",
              },
              { name: "caption", type: "string", note: "Text under the photo in the viewer." },
              { name: "width", type: "number", required: true, note: "Intrinsic width in pixels." },
              {
                name: "height",
                type: "number",
                required: true,
                note: "Intrinsic height in pixels.",
              },
              { name: "src", type: "string", required: true, note: "The fallback source." },
              {
                name: "sources",
                type: "readonly { srcSet: string; type: string }[]",
                note: "Sources the browser may prefer, such as a modern format, offered through `<source>`.",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "helpers",
    title: "Helpers",
    intro:
      "The pieces under the parts, installed as registry items of their own for use outside the viewer.",
    parts: [
      {
        name: "resolveMorphEngine",
        item: "ombra-morph",
        file: "morph.ts",
        summary:
          "The engine that will run for a request: reduced motion fades, and `vt` without `document.startViewTransition` runs FLIP.",
        renders: "A function.",
        tables: [
          {
            kind: "parameters",
            title: "Parameters",
            of: "resolveMorphEngine",
            entries: morphParams,
          },
        ],
        returns: morphEngine,
      },
      {
        name: "useZoom",
        item: "ombra-zoom",
        file: "use-zoom.ts",
        summary:
          "Pinch, double-tap, wheel and keyboard zoom on a layer inside a scroll track, with the gesture rules the viewer uses. It publishes `--ombra-zoom` on the enclosing dialog.",
        renders: "A hook.",
        tables: [
          { kind: "parameters", title: "Parameters", of: "useZoom", entries: zoomParams },
          {
            kind: "object",
            title: "Returns",
            of: "ReturnType<typeof useZoom>",
            entries: zoomReturns,
          },
        ],
        cssVariables: [
          {
            name: "--ombra-zoom",
            note: "The layer's scale, 1 at its fitted size, on the enclosing `[role=dialog]`.",
          },
        ],
      },
    ],
  },
];

export function listApiParts(): readonly ApiPart[] {
  return apiGroups.flatMap((group) => group.parts);
}
