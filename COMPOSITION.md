# Composition-first usage

Ombra's public API lets the caller assemble a lightbox from React components. Layout, media, captions, and controls belong in JSX. Props configure the behavior of the part receiving them.

Every part below is implemented: `OmbraRoot` and its state contract, the dialog shell, `OmbraTrigger`, the slide parts (`OmbraSlides`, `OmbraSlide`, `OmbraMedia`), the zoom parts (`OmbraZoom`, `OmbraZoomIn`, `OmbraZoomOut`), and the controls (`OmbraPrevious`, `OmbraNext`, `OmbraCounter`, `OmbraThumbnails`, `OmbraThumbnail`). Two optional recipes are built from them: `OmbraGallery` and `OmbraAlbum` (see Recipes).

Implementation was tracked in [MAR-64](https://linear.app/marciobarrios/issue/MAR-64/migrate-the-lightbox-spike-to-composable-primitives-and-gallery), in Ombra's v0.1 MVP milestone. The [Linear architecture document](https://linear.app/marciobarrios/document/ombra-composition-architecture-primitives-styled-parts-and-recipes-e67e6acc5788) records the same recommendation for project planning.

## Implemented dialog shell (MAR-139)

`registry/ombra/ombra-dialog.tsx` exports `OmbraPortal`, `OmbraBackdrop`,
`OmbraContent`, and `OmbraClose`. They wrap the matching Base UI Dialog parts
(`OmbraContent` wraps `Dialog.Popup`) and accept their native props, refs,
state-aware `className`, and `render` contracts. Base UI merges handlers and refs
on render elements. A render callback must spread the received props, including
its ref; a custom component must forward them to its actual DOM node.

These shell parts live under a Base UI `Dialog.Root`. `OmbraRoot` renders that
root and connects it to its state; inside it, `OmbraPortal` also runs the viewer
(see below). A shell-only composition can use Base UI directly, and then gets no
morph, pull or zoom:

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
The gallery recipe renames its content slot `ombra-viewer`, and the album
`ombra-album`. Base UI supplies open/closed and transition attributes on backdrop
and content, and `data-disabled` on close; the portal has no independent state.
Under an `OmbraRoot`, the content also carries `data-phase`, `data-engine`,
`data-pulling`, and `data-zoomed`.

Content defaults to a full viewport with safe-area padding and the page's
background/foreground tokens. The gallery overrides that padding because its
header and footer already account for safe areas. Classes merge through `cn()`;
structural styles ship in the registry payload. The default initial focus is the
first enabled `ombra-close` inside content, with `preventScroll`; without a close
part it focuses content. An explicit `initialFocus` overrides that default.
`OmbraClose` supplies no text or accessible label: consumers own both. The
`/spike/dialog` bench exercises custom surfaces, labels, refs, dismissal, and pull
targeting.

## The viewer (MAR-143)

Inside an `OmbraRoot`, `OmbraPortal` runs the viewer: the open and close morphs, the
pull to dismiss, zoom and the keyboard shortcuts. `OmbraBackdrop` and `OmbraContent`
take its refs, state attributes and handlers, merged with the caller's: refs and
classes compose, the caller's `onKeyDown` runs first, and an explicit `finalFocus`
replaces the viewer's focus return. A composition renders the parts and never calls
the viewer itself. Render one portal per root. The portal also renders the morph's
`<style>` beside the dialog, so a closing view transition still has it.

The root takes the collection and the morph:

```tsx
<OmbraRoot itemIds={photos.map((photo) => photo.id)} morph="flip">
```

- **`itemIds`.** The collection in navigation order. The slides mount only with the
  viewer, so a closed viewer learns what it can open on from here. Items are
  identified by these IDs everywhere else: triggers, slides, thumbnails.
- **`morph`.** `flip` (the default), `vt` or `fade`. A browser without View
  Transitions runs FLIP for `vt`, and reduced motion always fades.
- **`useOmbraState()`.** Returns `open`, `phase`, `activeId`, `index` and `itemIds`,
  for titles, captions and announcements a composition renders around the parts.
- **Diagnostics.** `OmbraDiagnostics` (in `ombra-viewer.tsx`) wraps a root to slow
  every morph down, try the spring curve, or receive frame timing. The spike page
  uses it; a composition never needs it.

## Implemented trigger (MAR-66)

`registry/ombra/ombra-trigger.tsx` exports `OmbraTrigger`, built on Base UI's
`Dialog.Trigger`. `OmbraRoot` renders the one `Dialog.Root` that every trigger and
shell part shares, so a composition needs no Base UI root of its own:

```tsx
<OmbraRoot itemIds={photos.map((photo) => photo.id)}>
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
  item, so a controlled parent can refuse it and a press starts one morph.
- **Ownership.** While the viewer is open, the root passes the current item's
  trigger as Base UI's `triggerId`. `aria-expanded` and Base UI's default focus
  return follow navigation, not the press that opened the viewer. When the current
  item has no trigger on the page, no trigger owns the dialog.
- **Focus return.** The viewer focuses the current item's trigger, or the nearest
  trigger still rendered when it is gone. A shell under a plain Base UI root gets
  Base UI's default instead.
- **Composition.** Native props, `className`, `style`, the forwarded ref and
  `render` pass to `Dialog.Trigger`. A handler that calls
  `event.preventBaseUIHandler()` cancels the open. A trigger rendered as a
  non-button element needs `nativeButton={false}`.
- **Source media.** The morph flies from the trigger's first `<img>`. For other
  markup, pass `mediaRef` pointing at the element to measure and hide. Media that
  is not an image skips the decode wait. A trigger with no media at all, such as a
  text button, fades the viewer in.
- **Registration.** A trigger registers its element as its item's morph source and
  focus target. The item itself comes from the root's `itemIds`, so one trigger can
  open a collection of many items. The first connected trigger in document order
  wins when several share an item.

The `/spike/trigger` bench composes `OmbraRoot`, triggers and the shell, with no
slides.

## Implemented slides and media (MAR-140)

`registry/ombra/ombra-slides.tsx` exports `OmbraSlides`, `OmbraSlide`, and
`OmbraMedia`. Each renders one element with a `data-slot` (`ombra-track`,
`ombra-slide`, `ombra-media`), and accepts native props, a forwarded ref,
`className` (merged through `cn()`), and Base UI's `render` prop.

```tsx
<OmbraSlides>
  {photos.map((photo) => (
    <OmbraSlide key={photo.id} itemId={photo.id} aria-label={photo.alt} className="flex-col">
      <div className="flex min-h-0 w-full flex-1 [container-type:size]">
        <OmbraMedia width={photo.width} height={photo.height}>
          <Image src={photo.src} alt="" width={photo.width} height={photo.height} />
        </OmbraMedia>
      </div>
      <p>{photo.caption}</p>
    </OmbraSlide>
  ))}
</OmbraSlides>
```

- **Track.** `OmbraSlides` is the native scroll-snap track, with a spacer at each
  end so the first and last slides can rest centred. The active item follows the
  slide nearest the centre as the track scrolls, so a smooth navigation publishes
  each slide it passes. When the track rests on a slide a controlled parent refused,
  it glides back to the active one. A reorder or removal puts the active slide back
  under the track at once. One track per root.
- **Slide.** `OmbraSlide` takes an `itemId` and is the snap box: its size never
  changes during a pull or a zoom. It is a size container, sets `role="group"`,
  `aria-roledescription="slide"` and `data-active`; consumers supply `aria-label`.
  Captions and other markup are ordinary children.
- **Media.** `OmbraMedia` takes the media's intrinsic `width` and `height`, and
  sizes itself to the largest box of that ratio that fits its parent's size
  container, centred. That box is where the open morph lands and the close morph
  leaves from, so the image renderer inside does not matter: a native `img`,
  Next.js `Image` (the `/spike/media` bench), or a `picture`. The first `<img>`
  inside receives the decoded thumbnail source when a swipe catches the photo still
  loading. Directly in a slide, the media fits the whole slide; beside a caption,
  give it a parent with `container-type: size`.
- **Registration.** A slide registers its element and a media registers its box and
  size with the root, by item ID. The viewer finds the FLIP clone's destination,
  the View Transition's shared element, the fade fallback and the hand-off target
  through them. Slides mount only while the viewer is open, so the collection a
  closed viewer opens from comes from the root's `itemIds`. Pull progress stays in
  `--ombra-pull-live`.

## Implemented zoom (MAR-141)

`registry/ombra/ombra-zoom.tsx` exports `OmbraZoom`, `OmbraZoomIn`, and
`OmbraZoomOut`. Each renders one element with a `data-slot` (`ombra-zoom`,
`ombra-zoom-in`, `ombra-zoom-out`), and accepts native props, a forwarded ref,
`className` (merged through `cn()`), and Base UI's `render` prop.

```tsx
<OmbraSlide itemId={photo.id} aria-label={photo.alt}>
  <OmbraZoom>
    <OmbraMedia width={photo.width} height={photo.height}>
      <img src={photo.src} alt="" width={photo.width} height={photo.height} />
    </OmbraMedia>
  </OmbraZoom>
</OmbraSlide>

<OmbraZoomOut aria-label="Zoom out">−</OmbraZoomOut>
<OmbraZoomIn aria-label="Zoom in">+</OmbraZoomIn>
```

- **Surface.** `OmbraZoom` goes inside an `OmbraSlide`, around its `OmbraMedia`, and
  registers itself with the root by the slide's item ID. Pinch, double-tap,
  ctrl+wheel, trackpad pinch and the `+`, `-` and `0` keys zoom the active slide's
  surface. A slide without one does not zoom: its pinch and double-tap go nowhere,
  and its swipes and pulls behave as before. Zooming scales the surface, never the
  media's resting box, so the morph still lands where the media rests. The surface
  sets `touch-action: manipulation` to keep Safari's native double-tap zoom off, and
  carries `data-zoomed` while zoomed.
- **Arbitration.** Unchanged: while zoomed, the track has `overflow: hidden` and
  `touch-action: none`, the pull is off, and a pan past the photo's edge hands off
  to the next slide (MAR-104). Navigating to another slide resets the zoom.
- **Actions.** `OmbraZoomIn` and `OmbraZoomOut` are buttons that zoom the active
  slide one step. Both are disabled while the active slide has no `OmbraZoom`, and
  `OmbraZoomOut` while the photo rests at its fitted size; both then carry
  `data-disabled`. They supply no text or accessible label: consumers own both.
  A handler that calls `event.preventBaseUIHandler()` cancels the step.
- **Driver.** The gestures run in `use-zoom.ts`, inside the viewer, which publishes
  its zoom to the actions through the root. The `/spike/zoom` bench renders every
  slide with `OmbraZoom`, none (`?zoom=off`), or only the first (`?zoom=first`).

## Implemented controls (MAR-142)

`registry/ombra/ombra-controls.tsx` exports `OmbraPrevious`, `OmbraNext`,
`OmbraCounter`, `OmbraThumbnails`, and `OmbraThumbnail`. Each renders one element
with a `data-slot` (`ombra-previous`, `ombra-next`, `ombra-counter`,
`ombra-thumbnails`, `ombra-thumbnail`), and accepts native props, a forwarded ref,
`className` (merged through `cn()`), and Base UI's `render` prop, whose callback
receives the part's state.

```tsx
<OmbraCounter>{({ position, count }) => `Foto ${position} de ${count}`}</OmbraCounter>
<OmbraPrevious aria-label="Foto anterior">‹</OmbraPrevious>
<OmbraNext aria-label="Foto siguiente">›</OmbraNext>

<OmbraThumbnails>
  {photos.map((photo) => (
    <OmbraThumbnail key={photo.id} itemId={photo.id} aria-label={photo.alt}>
      <img src={photo.thumbnail} alt="" />
    </OmbraThumbnail>
  ))}
</OmbraThumbnails>
```

- **Copy.** No part supplies text or an accessible label: consumers own both.
  `OmbraCounter` formats with its children function, which receives `position`
  (one-based), `count`, `index` and `activeId`; without one it shows
  `position / count` in digits. It carries `data-position` and `data-count`.
- **Previous and next.** Buttons that go one item back or forward from where a
  smooth navigation is heading, so rapid presses retarget. `OmbraPrevious` is
  disabled on the first item and `OmbraNext` on the last; both then carry
  `data-disabled`. A handler that calls `event.preventBaseUIHandler()` cancels the step.
- **Thumbnails.** `OmbraThumbnails` is the strip's scroller. It keeps the active
  thumbnail in view and, once its thumbnails overflow it, snaps and fades an edge
  cue in at each end with more beyond (scroll-driven, so only where the browser
  supports scroll timelines, and never under reduced motion). It carries
  `data-overflowing` and renders inside a positioned `ombra-thumbnails-frame` that
  holds the cues. `OmbraThumbnail` is a button linked to its slide by `itemId`; it
  carries `data-active` and `aria-current` while its item is active.
- **Keyboard.** The viewer's arrows, Home and End move between items; `+`, `-` and
  `0` zoom. A key is left alone when a handler already called `preventDefault()`
  on it, when it carries Ctrl, Alt or Meta (or Shift, for navigation), and when
  focus is in an input, a textarea, a select, editable content, media controls or
  an ARIA widget that uses the arrows. Navigation keys also stay with a scrolling
  panel of the consumer's that holds focus. To replace a shortcut, call
  `preventDefault()` on the key in an `onKeyDown` on `OmbraContent` or on an element
  inside it: the viewer's handler runs after the caller's.
- **Omission.** Every control is optional; leaving one out is a JSX change. The
  `/spike/controls` bench labels them in Spanish, puts a text field and a scrolling
  panel in the viewer, and leaves them all out with `?controls=none`.

## Recipes (MAR-143)

Two optional recipes ship as editable source, built only from the parts above. Neither
calls anything the parts do not expose, and each owns its data shape: the root sees
only IDs.

- **`OmbraGallery`** (`ombra-gallery.tsx`) takes `items` (`OmbraGalleryItem`: id, alt,
  caption, size, thumbnail frame and sources) and the root's state props and `morph`.
  It renders a masonry grid of triggers and a viewer with a counter, zoom actions and
  close in the header, previous and next over the photo, a caption, and the thumbnail
  strip. Photos are native `<img>` with zoom. It takes no debug props: the spike page
  wraps it in `OmbraDiagnostics`.
- **`OmbraAlbum`** (`ombra-album.tsx`) takes a `title` and `photos`
  (`OmbraAlbumPhoto`). One cover opens the whole album. Its header holds the visible
  title, the counter, previous, next and close; photos render through `<picture>`
  with a caption under each; there is no thumbnail strip and no zoom. The
  `/spike/album` bench renders it.

Between the two, moving the controls, changing the image renderer and leaving out zoom
and the thumbnails are JSX edits, which `e2e/ombra-album.spec.ts` covers. Copy a
recipe and edit it, or compose the parts directly.

## Architecture decision — 6 November 2026

Use three layers, all distributed as copied registry source:

1. **Behavior primitives.** Coordinate state, registration, dialog accessibility, native slide navigation, media sizing, zoom, pull, and morphing. Retain Base UI Dialog for the modal shell and Base UI's composition conventions. Keep structural styles required for correct interaction with the implementation that owns them.
2. **Editable styled parts.** Supply useful Tailwind defaults with `cn()`, `data-slot`, state attributes, CSS variables, native props, refs, and `className` overrides. Support `render` where consumers need to substitute a host element or their own component. Keep cosmetics separate from interaction mechanics so styling edits do not require rewriting gestures or accessibility.
3. **Ready-made recipes.** Assemble complete galleries from those same public parts. Provide a useful default recipe, plus a second composition that proves consumers can change layout, controls, and image rendering through JSX. Recipes own application data mapping and presentation; the primitive root does not prescribe an image collection schema.

The core coordinates interaction; the consuming application owns presentation. Adding or moving a control should be a JSX edit. Props remain appropriate for state, behavior, and attributes of the receiving part.

Keep the primitive count small. Each part must own a distinct behavior or a surface callers need to replace. Do not add wrappers solely to imitate another library's component tree. Component names and file boundaries remain proposals until implementation validates the compositions.

This decision preserves Ombra's shadcn distribution and dependency boundary. Base UI is the dialog foundation; Tailwind supplies editable styling. No additional dialog, carousel, gesture, or animation runtime is required. Broader layout recipes, registry packaging, and public docs should build on this shared composition contract through their existing implementation issues.

## Principle

The guiding principle is that consumers arrange headless parts and supply their own presentation. Controls and alternate layouts are compositions of those parts.

Before MAR-64, `OmbraGallery` was the only API: it took an item schema and the spike's engine, slow-motion and spring props, and owned the grid, dialog layout, image rendering, caption, controls and diagnostics. It is now one recipe among the compositions the parts allow.

## Usage

Named exports follow the shadcn convention. Imports resolve to source copied into the consuming app. This example assumes an application-owned `photos` array; the root needs only its IDs.

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
    <OmbraRoot itemIds={photos.map((photo) => photo.id)}>
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

The example shows the component relationships; application data types and final styling are omitted. Copied components include editable default classes, including the structural sizing, scroll-snap, safe areas, focus rings, and touch targets this composition needs.

The caller can replace the grid with a feed or a single trigger, reposition the controls, and add ordinary markup around the parts. Zoom is enabled by including `OmbraZoom`. Captions can be ordinary slide content; thumbnails, counters, and zoom buttons are optional components. Omit a control to remove it. Avoid `showThumbnails`, `showCounter`, `toolbarPosition`, `renderSlide`, and growing configuration objects for visual structure.

## Part responsibilities

| Part                                           | Responsibility                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `OmbraRoot`                                    | Coordinate open state, active item, the collection (`itemIds`), and the morph choice. Render no layout wrapper.        |
| `OmbraTrigger`                                 | Open its `itemId`, expose dialog disclosure semantics, and register the source element for morph and focus return.     |
| `OmbraPortal`, `OmbraBackdrop`, `OmbraContent` | Compose the dialog shell around Base UI and run the viewer. Preserve focus trapping, Escape, scroll lock, and naming.  |
| `OmbraSlides`, `OmbraSlide`                    | Own native scroll-snap navigation and stable item identity. Each slide remains a stable snap box during pull and zoom. |
| `OmbraZoom`                                    | Add pinch, double-tap, wheel, and keyboard zoom for its media; coordinate pan handoff with the track.                  |
| `OmbraMedia`                                   | Register the destination morph element and intrinsic dimensions independently of the image renderer.                   |
| `OmbraPrevious`, `OmbraNext`, `OmbraClose`     | Provide accessible actions with consumer-owned labels, children, positioning, and button rendering.                    |
| `OmbraThumbnails`, `OmbraThumbnail`            | Provide an optional strip with navigation and selected state, linked by `itemId`.                                      |
| `OmbraCounter`, `OmbraZoomIn`, `OmbraZoomOut`  | Provide optional state output and actions. Counter formatting belongs to the caller.                                   |

Use one slide identity layer initially; an additional item wrapper needs a concrete use case. Stable string `itemId` values connect triggers, slides, and thumbnails; slide order determines navigation order. Do not make array indices the public identity when content can reorder.

## Behavior contract

- Support uncontrolled state by default, with `defaultOpen` and `defaultActiveId` for initial values. Offer `open` / `onOpenChange` and `activeId` / `onActiveIdChange` for controlled use. A trigger chooses its item before opening; state requests must respect a controlled parent's decision.
- Keep behavioral options small and local. The root's `morph` option selects `flip`, `vt`, or `fade`, defaulting to `flip`. Reduced motion forces the fade. The cubic easing stays; the spring is a spike experiment (MAR-12).
- Preserve the distinction between a requested navigation target and the currently centered slide. Smooth navigation must continue to publish selection from scrolling rather than selecting the destination immediately.
- Keep DOM refs and motion progress internal. A pull must continue to update `--ombra-pull-live` without a React render on every pointer move. Structural composition must preserve the current FLIP clone, gesture arbitration, and interruption behavior.
- Parts accept native props, refs, and `className`. Support Base UI's `render` pattern for replaceable host elements where appropriate, with composed handlers and refs. Image rendering must work with a native image or Next.js Image without requiring a Next.js dependency. The implementation must define an explicit source-media ref escape hatch for custom trigger markup.
- Require a caller-supplied accessible dialog name and meaningful action labels. Navigation must leave inputs, editable content, and unrelated scrollable panels usable. Focus returns to the current item's trigger when available, with a defined fallback when it was removed.
- Registration: duplicate or unmatched IDs produce development diagnostics; empty collections cannot open a viewer; removing the active item selects a remaining neighbor or closes when none remain. Multiple roots operate independently.

## Migration (MAR-64, done)

1. Extract shared state, registration, and dialog lifecycle from `OmbraGallery` without rewriting its morph or gesture algorithms. Move engine switches, slow motion, frame sampling UI, and experiment controls into the docs spike.
2. Implement the parts and rebuild the current gallery as a composition. Keep any ready-made gallery as an optional editable recipe built from those same parts. Root consumers should never need the spike's debug props or `OmbraItem` schema.
3. Add a second composition, such as a standalone trigger with a custom header and no thumbnail strip. Verify that moving controls, supplying a different image renderer, and omitting zoom require JSX changes only.
4. Validate controlled and uncontrolled opening/navigation, reordered and removed items, empty collections, multiple roots, custom trigger refs, native and Next.js images, focus return, keyboard navigation, and labels. Run the existing morph, zoom, pull, and thumbnail-selection regression suite across all four Playwright projects. Add targeted coverage for the new composition and state contracts.
5. Update registry files and usage docs together. Keep required structural CSS in the copied payload and retain the core dependency boundary: React, Base UI, and `cn`.
