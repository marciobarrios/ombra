# Scroll-driven animations assessment

Assessment for [MAR-58](https://linear.app/marciobarrios/issue/MAR-58/css-scroll-driven-animations-baseline-available), checked on 5 November 2026 against the current registry source and updated with the 9 November 2026 decision. The [edge cues](SPIKE.md#thumbnail-edge-cues) have been functionally tested, but have not been comparatively benchmarked.

## Decision

CSS scroll-driven animations can add useful visual feedback to Ombra without a runtime dependency. On 9 November 2026 we kept thumbnail-strip edge cues, always on and in the registry, and removed thumbnail emphasis and the selectable modes. Keep native scroll-snap, JavaScript selection, thumbnail centering, zoom, pull-to-dismiss, and the morph engines.

There is no existing per-frame visual animation to replace here. The benefit would be new feedback tied directly to native scrolling, rather than a demonstrated performance improvement to the current viewer.

## Browser support

The [Web Platform DX feature entry](https://web-platform-dx.github.io/web-features-explorer/features/scroll-driven-animations/) marks scroll-driven animations **Baseline Newly available since 27 October 2026**. Its minimum versions are Chrome/Edge 115, Safari/iOS Safari 26, and Firefox/Firefox Android 159. [Firefox 159 release notes](https://www.firefox.com/en-US/firefox/159.0/releasenotes/) confirm that release added the timeline properties and APIs. Newly available still requires a fallback for older browsers.

Safari support and threading are separate milestones: [WebKit's Safari 26.4 announcement](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/) says scroll-driven animations gained compositor-thread execution in 26.4. Do not infer equivalent performance on every supported Safari version from syntax support alone.

The issue's linked X post returned HTTP 403 during this assessment. The support conclusion above comes from platform documentation, not from inspecting that post or its demo.

## Thumbnail strip: edge cues

The strip already scrolls natively, snaps when overflowing, and centers the selected thumbnail from JavaScript. A small edge cue indicates that more thumbnails are available to the left or right, disappearing at the corresponding end.

Use a named horizontal `scroll-timeline` on `[data-slot="ombra-thumbnails"]` and two fixed gradient overlays in a wrapper. Animate only the overlays' opacity. Expand the named timeline's scope to that wrapper so the overlays can consume their sibling scroller's timeline. The overlays must ignore pointer events and leave the buttons and focus outlines unobstructed.

Use the existing `data-overflowing` measurement to disable the cues when all thumbnails fit. Preserve that measurement: a timeline cannot replace the state that chooses the row padding and snap behavior. Keep the existing 44px thumbnail hit areas and avoid animating button width, gap, or padding, which would change scroll geometry.

This feedback describes the strip's own scroll position. It must not imply which gallery photo is selected: a user can browse the thumbnail strip independently of the gallery.

## Gallery-driven thumbnail emphasis

Rejected on 9 November 2026. The spike gave each slide a named `view-timeline` and crossfaded the matching thumbnail's image opacity as its slide approached the gallery center.

At rest it matched the existing appearance exactly: 1.00 for the selected thumbnail and 0.60 for the others. It differed only during a swipe, peaking halfway between slides at 0.77 for both neighbors instead of 1.00 and 0.60. In hands-on review the difference went unnoticed, which did not justify a timeline per slide. Lowering the resting opacity would make the crossfade more visible, but make unselected thumbnails harder to recognize.

## What stays in JavaScript

`bindTrack` in `registry/ombra/ombra-gallery.tsx` uses passive `scroll` events to find the nearest slide and publishes state only when the index changes. `scrollend`, with a 140ms timer fallback, also tracks settling. `indexFromScroll` in `registry/ombra/geometry.ts` compares actual slide centers.

That selected index controls the counter, captions, live announcements, `aria-current`, image decoding, zoom reset, and the thumbnail that receives focus on close. CSS timelines cannot perform those application updates. Removing the listener would also break pull's settled-track guard. This is not a React re-render for every scrolled pixel: the state setter already bails out when the index is unchanged.

The strip's `scrollTo` effect moves its viewport to the selected thumbnail. A scroll-driven animation consumes scroll position; it does not synchronize two independent scroll offsets. Keep that effect and its reduced-motion behavior.

Zoom/pan and pull are pointer-driven interactions. Keep their existing transforms, scroll locking, edge handoff, and `--ombra-pull-live` updates. Open/close morphs are also independent of scroll progress. Animating the gallery image or zoom layer with a scroll timeline would introduce competing visual behavior during those gestures and morphs.

Avoid adding scale, parallax, or entrance fades to the main photographs. The viewer already exposes neighboring slides during native scrolling; legibility and uninterrupted gesture tracking matter more than an additional effect.

## Implementation conditions

- Gate each enhancement with `@supports` covering the timeline syntax, scope, and range declarations it actually uses. Retain the static appearance outside that block, and never hide content while waiting for a timeline.
- Use explicit timeline names rather than requiring `timeline-scope: all`. MDN flags varying support for parts of `timeline-scope`.
- Declare `animation-timeline` and `animation-range` after the `animation` shorthand, which resets them. [MDN explains the reset behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline).
- Keep scrubbed feedback linear, with no spring or delayed transition following scroll progress. Under `prefers-reduced-motion: reduce`, retain the static selected state and omit the optional effects.
- Keep the CSS in the copied registry payload; rules added only to `apps/docs/app/globals.css` would not reach registry consumers.

The initial assessment used source inspection and platform documentation. The later experiment verified actual CSS feedback and interaction behavior in Chromium and WebKit, including their mobile profiles. See the spike notes for the WebKit pseudo-element limitation and the VT fallback fix. Firefox 159+, performance measurements, and real-phone evaluation including Low Power Mode remain outstanding; Playwright WebKit is not iOS Safari.
