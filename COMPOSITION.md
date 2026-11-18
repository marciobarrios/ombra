# Composition-first usage

Ombra's public API should let the caller assemble a lightbox from React components. Layout, media, captions, and controls belong in JSX. Props configure the behavior of the part receiving them.

This is the target contract, not an implemented API. The current `OmbraGallery` remains a morph and gesture spike. The names and examples below describe the next registry API. `OmbraRoot` and its state contract (controlled and uncontrolled open and active item, stable IDs, registration behaviour) are implemented, and `OmbraGallery` runs on it. So are the dialog shell parts and `OmbraTrigger`; the other parts are not yet.

Implementation is tracked in [MAR-64](https://linear.app/marciobarrios/issue/MAR-64/migrate-the-lightbox-spike-to-composable-primitives-and-gallery), in Ombra's v0.1 MVP milestone. The [Linear architecture document](https://linear.app/marciobarrios/document/ombra-composition-architecture-primitives-styled-parts-and-recipes-e67e6acc5788) records the same recommendation for project planning.

## Implemented dialog shell (MAR-139)

`registry/ombra/ombra-dialog.tsx` exports `OmbraPortal`, `OmbraBackdrop`,
`OmbraContent`, and `OmbraClose`. They wrap the matching Base UI Dialog parts
(`OmbraContent` wraps `Dialog.Popup`) and accept their native props, refs,
state-aware `className`, and `render` contracts. Base UI merges handlers and refs
on render elements. A render callback must spread the received props, including
its ref; a custom component must forward them to its actual DOM node.

These shell parts live under a Base UI `Dialog.Root`. `OmbraRoot` renders that
root and connects it to its state and morph driver (see the trigger section below).
Extracting the other viewer behaviors remains part of the subsequent migration
slices. A shell-only composition can use Base UI directly:

```tsx
<Dialog.Root>
  <Dialog.Trigger>Ver fotos</Dialog.Trigger>
  <OmbraPortal>
    <OmbraBackdrop />
    <OmbraContent aria-label="Fotografías" render={<CustomSurface />}>
      <header>Viaje</header>
      <OmbraClose aria-label="Cerrar fotos">×</OmbraClose>
    </OmbraContent>
  </OmbraPortal>
</Dialog.Root>
```

The slots are `ombra-portal`, `ombra-backdrop`, `ombra-content`, and `ombra-close`.
The existing gallery keeps its `ombra-viewer` content slot for its current
selectors. Base UI supplies open/closed and transition attributes on backdrop
and content, and `data-disabled` on close; the portal has no independent state.
The gallery also supplies `data-phase`, `data-engine`, `data-pulling`, and
`data-zoomed` on its content.

Content defaults to a full viewport with safe-area padding and the page's
background/foreground tokens. The gallery overrides that padding because its
header and footer already account for safe areas. Classes merge through `cn()`;
structural styles ship in the registry payload. The default initial focus is the
first enabled `ombra-close` inside content, with `preventScroll`; without a close
part it focuses content. An explicit `initialFocus` overrides that default.
`OmbraClose` supplies no text or accessible label: consumers own both. The
`/spike/dialog` bench exercises custom surfaces, labels, refs, dismissal, and pull
targeting.

## Implemented trigger (MAR-66)

`registry/ombra/ombra-trigger.tsx` exports `OmbraTrigger`, built on Base UI's
`Dialog.Trigger`. `OmbraRoot` renders the one `Dialog.Root` that every trigger and
shell part shares, so a composition needs no Base UI root of its own:

```tsx
<OmbraRoot>
  {photos.map((photo) => (
    <OmbraTrigger key={photo.id} itemId={photo.id}>
      <img src={photo.thumbnail} alt={photo.alt} />
    </OmbraTrigger>
  ))}
  <OmbraPortal>
    <OmbraBackdrop />
    <OmbraContent>{/* title, slides, controls */}</OmbraContent>
  </OmbraPortal>
</OmbraRoot>
```

- **Semantics.** Base UI supplies the button behaviour, `disabled`, `id`,
  `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` and `data-popup-open`.
  Ombra adds no ARIA of its own.
- **One open path.** A press reaches the Base UI root's `onOpenChange(true)`. The
  root cancels Base UI's own open and calls `requestOpen` for the pressed trigger's
  item, so a controlled parent can refuse it and a press starts one morph. A
  `Dialog.Trigger` without an `itemId` opens the active item.
- **Ownership.** While the viewer is open, the root passes the current item's
  trigger as Base UI's `triggerId`. `aria-expanded` and Base UI's default focus
  return follow navigation, not the press that opened the viewer. When the current
  item has no trigger on the page, no trigger owns the dialog.
- **Focus return.** The gallery focuses the current item's trigger, or the nearest
  trigger still rendered when it is gone. A composition without the gallery's
  viewer gets Base UI's default instead, which focuses no other item's trigger.
- **Composition.** Native props, `className`, `style`, the forwarded ref and
  `render` pass to `Dialog.Trigger`. A handler that calls
  `event.preventBaseUIHandler()` cancels the open. A trigger rendered as a
  non-button element needs `nativeButton={false}`.
- **Source media.** The morph flies from the trigger's first `<img>`. For other
  markup, pass `mediaRef` pointing at the element to measure and hide. Media that
  is not an image skips the decode wait.
- **Registration.** A trigger registers its element as its item's morph source and
  focus target. It does not register the item: the gallery does that for now, and
  slides will (MAR-140). The first connected trigger in document order wins when
  several share an item.

The `/spike/trigger` bench composes `OmbraRoot`, triggers and the shell without the
gallery's viewer.

## Architecture decision — 6 November 2026

Use three layers, all distributed as copied registry source:

1. **Behavior primitives.** Coordinate state, registration, dialog accessibility, native slide navigation, media sizing, zoom, pull, and morphing. Retain Base UI Dialog for the modal shell and Base UI's composition conventions. Keep structural styles required for correct interaction with the implementation that owns them.
2. **Editable styled parts.** Supply useful Tailwind defaults with `cn()`, `data-slot`, state attributes, CSS variables, native props, refs, and `className` overrides. Support `render` where consumers need to substitute a host element or their own component. Keep cosmetics separate from interaction mechanics so styling edits do not require rewriting gestures or accessibility.
3. **Ready-made recipes.** Assemble complete galleries from those same public parts. Provide a useful default recipe, plus a second composition that proves consumers can change layout, controls, and image rendering through JSX. Recipes own application data mapping and presentation; the primitive root does not prescribe an image collection schema.

The core coordinates interaction; the consuming application owns presentation. Adding or moving a control should be a JSX edit. Props remain appropriate for state, behavior, and attributes of the receiving part.

Keep the primitive count small. Each part must own a distinct behavior or a surface callers need to replace. Do not add wrappers solely to imitate another library's component tree. Component names and file boundaries remain proposals until implementation validates the compositions.

This decision preserves Ombra's shadcn distribution and dependency boundary. Base UI is the dialog foundation; Tailwind supplies editable styling. No additional dialog, carousel, gesture, or animation runtime is required. Broader layout recipes, registry packaging, and public docs should build on this shared composition contract through their existing implementation issues.

## Principle and current gap

The guiding principle is that consumers arrange headless parts and supply their own presentation. Controls and alternate layouts are compositions of those parts.

Ombra currently exposes `OmbraGallery` with an `items` schema and required engine, slow-motion, spring, and change-handler props. It also owns the thumbnail grid, dialog layout, image rendering, caption, controls, and diagnostics. The consumer can change the data but cannot rearrange those pieces.

Adopt the composition principle using Ombra's existing Base UI dialog and motion implementation.

## Intended usage

Proposed named exports follow the shadcn convention. Imports resolve to source copied into the consuming app. This example assumes an application-owned `photos` array; the root does not require an Ombra-specific data schema.

```tsx
import {
  OmbraRoot,
  OmbraTrigger,
  OmbraPortal,
  OmbraBackdrop,
  OmbraContent,
  OmbraSlides,
  OmbraSlide,
  OmbraZoom,
  OmbraMedia,
  OmbraPrevious,
  OmbraNext,
  OmbraClose,
} from "@/components/ombra";

export function PhotoGallery({ photos }) {
  return (
    <OmbraRoot>
      <div className="grid grid-cols-2 gap-3">
        {photos.map((photo) => (
          <OmbraTrigger key={photo.id} itemId={photo.id}>
            <img src={photo.thumbnail} alt={photo.alt} />
          </OmbraTrigger>
        ))}
      </div>

      <OmbraPortal>
        <OmbraBackdrop />
        <OmbraContent aria-label="Photo gallery">
          <OmbraSlides>
            {photos.map((photo) => (
              <OmbraSlide key={photo.id} itemId={photo.id}>
                <OmbraZoom>
                  <OmbraMedia width={photo.width} height={photo.height}>
                    <img
                      src={photo.src}
                      alt={photo.alt}
                      width={photo.width}
                      height={photo.height}
                    />
                  </OmbraMedia>
                </OmbraZoom>
              </OmbraSlide>
            ))}
          </OmbraSlides>

          <OmbraPrevious aria-label="Previous photo">Previous</OmbraPrevious>
          <OmbraNext aria-label="Next photo">Next</OmbraNext>
          <OmbraClose aria-label="Close gallery">Close</OmbraClose>
        </OmbraContent>
      </OmbraPortal>
    </OmbraRoot>
  );
}
```

The example shows the component relationships; application data types and final styling are omitted. Copied components should include useful, editable default classes, including the structural sizing, scroll-snap, safe areas, focus rings, and touch targets needed by this composition.

The caller can replace the grid with a feed or a single trigger, reposition the controls, and add ordinary markup around the parts. Zoom is enabled by including `OmbraZoom`. Captions can be ordinary slide content; thumbnails, counters, and zoom buttons are optional components. Omit a control to remove it. Avoid `showThumbnails`, `showCounter`, `toolbarPosition`, `renderSlide`, and growing configuration objects for visual structure.

## Part responsibilities

| Part                                           | Responsibility                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `OmbraRoot`                                    | Coordinate open state, active item, registration, and morph lifecycle. Render no layout wrapper.                       |
| `OmbraTrigger`                                 | Open its `itemId`, expose dialog disclosure semantics, and register the source element for morph and focus return.     |
| `OmbraPortal`, `OmbraBackdrop`, `OmbraContent` | Compose the dialog shell around Base UI. Preserve focus trapping, Escape, scroll locking, and accessible naming.       |
| `OmbraSlides`, `OmbraSlide`                    | Own native scroll-snap navigation and stable item identity. Each slide remains a stable snap box during pull and zoom. |
| `OmbraZoom`                                    | Add pinch, double-tap, wheel, and keyboard zoom for its media; coordinate pan handoff with the track.                  |
| `OmbraMedia`                                   | Register the destination morph element and intrinsic dimensions independently of the image renderer.                   |
| `OmbraPrevious`, `OmbraNext`, `OmbraClose`     | Provide accessible actions with consumer-owned labels, children, positioning, and button rendering.                    |
| `OmbraThumbnails`, `OmbraThumbnail`            | Provide an optional strip with navigation and selected state, linked by `itemId`.                                      |
| `OmbraCounter`, `OmbraZoomIn`, `OmbraZoomOut`  | Provide optional state output and actions. Counter formatting belongs to the caller.                                   |

Use one slide identity layer initially; an additional item wrapper needs a concrete use case. Stable string `itemId` values connect triggers, slides, and thumbnails; slide order determines navigation order. Do not make array indices the public identity when content can reorder.

## Behavior contract

- Support uncontrolled state by default, with `defaultOpen` and `defaultActiveId` for initial values. Offer `open` / `onOpenChange` and `activeId` / `onActiveIdChange` for controlled use. A trigger chooses its item before opening; state requests must respect a controlled parent's decision.
- Keep behavioral options small and local. A root `morph` option may select `flip`, `vt`, or `fade`, defaulting to `flip`. Reduced motion forces the existing fade behavior. Spring versus cubic remains undecided.
- Preserve the distinction between a requested navigation target and the currently centered slide. Smooth navigation must continue to publish selection from scrolling rather than selecting the destination immediately.
- Keep DOM refs and motion progress internal. A pull must continue to update `--ombra-pull-live` without a React render on every pointer move. Structural composition must preserve the current FLIP clone, gesture arbitration, and interruption behavior.
- Parts accept native props, refs, and `className`. Support Base UI's `render` pattern for replaceable host elements where appropriate, with composed handlers and refs. Image rendering must work with a native image or Next.js Image without requiring a Next.js dependency. The implementation must define an explicit source-media ref escape hatch for custom trigger markup.
- Require a caller-supplied accessible dialog name and meaningful action labels. Navigation must leave inputs, editable content, and unrelated scrollable panels usable. Focus returns to the current item's trigger when available, with a defined fallback when it was removed.
- Define registration behavior before shipping: duplicate or unmatched IDs produce development diagnostics; empty collections cannot open a viewer; removing the active item selects a remaining neighbor or closes when none remain. Multiple roots must operate independently.

## Migration and acceptance

1. Extract shared state, registration, and dialog lifecycle from `OmbraGallery` without rewriting its morph or gesture algorithms. Move engine switches, slow motion, frame sampling UI, and experiment controls into the docs spike.
2. Implement the parts and rebuild the current gallery as a composition. Keep any ready-made gallery as an optional editable recipe built from those same parts. Root consumers should never need the spike's debug props or `OmbraItem` schema.
3. Add a second composition, such as a standalone trigger with a custom header and no thumbnail strip. Verify that moving controls, supplying a different image renderer, and omitting zoom require JSX changes only.
4. Validate controlled and uncontrolled opening/navigation, reordered and removed items, empty collections, multiple roots, custom trigger refs, native and Next.js images, focus return, keyboard navigation, and labels. Run the existing morph, zoom, pull, and thumbnail-selection regression suite across all four Playwright projects. Add targeted coverage for the new composition and state contracts.
5. Update registry files and usage docs together. Keep required structural CSS in the copied payload and retain the core dependency boundary: React, Base UI, and `cn`.

The current spike demonstrates existing behavior only. This document establishes the intended usage; it does not claim these parts or their acceptance checks are implemented.
