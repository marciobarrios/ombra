# Morph engine spike

WAAPI FLIP is the default open/close engine, with View Transitions optional, as confirmed in MAR-12 on 6 November 2026. The spike is the docs route `/spike`, so one Vercel project can deploy it. Nothing here is the final registry API.

The [composition-first usage contract](COMPOSITION.md) defines the intended public API: consumer-owned JSX for layout, media, and controls, with the spike's diagnostics kept in the docs app.

See [the scroll-driven animations assessment](SCROLL-ANIMATIONS.md) for MAR-58: browser support, potential thumbnail feedback, and the interaction logic that stays in JavaScript.

See [the Safari zoom/header investigation](SPIKE-ZOOM-HEADER-INVESTIGATION.md) for MAR-61. Add `&debug=zoom` to a spike URL to capture local viewport, component, and pointer telemetry; export it before reloading. The toolbar has a scoped native double-tap safeguard, while Safari reproduction and real-iPhone acceptance remain pending.

## Thumbnail edge cues

Narrow gradients at the thumbnail strip's edges show that more thumbnails are available in that direction. Each disappears at its corresponding end, and both disappear when the strip fits. Use a narrow viewport to see them. They follow the strip's own scroll position and say nothing about the selected photo.

The cues are always on and ship in the registry: `stripEdgeStyles` in `registry/ombra/ombra-gallery.tsx` styles two hidden, aria-hidden spans in the footer. Ordinary elements are necessary here: in the tested WebKit build, footer pseudo-elements did not resolve the named scroll timeline even though its syntax passed `@supports`.

The cues require CSS timeline/range/scope support and `prefers-reduced-motion: no-preference`. Otherwise the spans stay hidden and the strip keeps its static appearance. Slow motion and Spring affect the morphs, not the cues: scroll position is their clock.

Selectable scroll feedback modes and gallery-driven thumbnail emphasis were removed on 9 November 2026. See [the assessment](SCROLL-ANIMATIONS.md#gallery-driven-thumbnail-emphasis) for why.

The experiment also exposed a pre-existing VT fallback bug: when a transition could not start, its driver remained `vt` and skipped the effect-driven morph. That path now hands control to FLIP/fade. Tests cover a missing View Transition API and closing toward an off-screen trigger.

Automated coverage in `e2e/thumbnail-edge-cues.spec.ts` checks edge endpoints and resize, reduced motion, a forced unsupported CSS gate, all morph engines, zoom, focus return, and pull dismissal.

Firefox 159+, real iPhone gestures, Low Power Mode, and comparative frame-time measurements remain unverified, so these are functional results, not a performance claim.

An axe audit of the open viewer on 5 November 2026 flagged the existing track as `scrollable-region-focusable`; dialog-level arrow navigation passes the interaction tests. The audit also requested manual review of modal focus guards and counter contrast. The edge spans are hidden from assistive technology and do not take focus.

`?engine=vt|flip|fade` selects View Transitions, WAAPI FLIP, or a plain fade. The on-screen radios write the same query. `?slow=1` (or the Slow motion button) multiplies open, close, and pull-snap durations by three. `?spring=1` (or the Spring switch beside those controls) replaces the cubic morph easing with a hand-rolled spring. It combines with the engine and with slow motion. When the OS asks for reduced motion, every engine becomes a fade and pull does not scale the sheet.

The fixed readout is the longest frame and the count of frames over 33 ms during the last open or close, sampled with `requestAnimationFrame`. The first frame of a sample is ignored. Safari does not need the long-animation-frame API.

## How to test

```bash
pnpm install
pnpm dev
```

Open <http://127.0.0.1:3000/spike>. The grid is thirty mixed-aspect photographs. Photos 13–30 add landscapes, foliage, architecture, and a nebula, with local WebP assets in 960px and 1600px widths. Their sources are recorded in [the photo inventory](apps/docs/public/photos/SOURCES.md). Thumbnails are cover crops; the viewer shows the full frame. Click or tap one.

- Arrow keys, Home, and End move the scroll-snap track. Escape closes. Focus returns to the thumbnail of the current slide.
- The bottom strip follows the current slide. Click a strip thumbnail to move there.
- Zoom in / out, `+`, `-`, and `0`. Double-click or double-tap the photo. Pinch, and ctrl+wheel, zoom toward the pointer. While zoomed, horizontal wheel pans the photo and the track does not change slides. Dragging past the edge hands the extra movement to the track.
- Drag down on the photo. A short drag springs back. Past about 110 px, or a flick faster than about 700 px/s, the drag hands off into the close morph. Pull is ignored while zoomed and while the track is still settling. With `?spring=1`, the snap-back and the close morph take the release velocity.
- Compare spring on and off: pull flick (snap-back versus dismiss), zoom button / double-tap / pinch past the maximum then release, and open/close on both FLIP and View Transitions.
- Close returns to the current slide’s thumbnail. If that thumbnail is off screen, the page scrolls it into view first. If it is still mostly hidden, the close is a fade.

Playwright covers open, keyboard movement, focus return, the engine query, zoom versus track scroll, Escape during a slow FLIP close, and the spring toggle (on, off, and the `linear()` fallback), on Chromium, WebKit, Pixel 7, and iPhone 13 profiles:

```bash
pnpm build
pnpm exec playwright install --with-deps chromium webkit
pnpm test:e2e
```

## What to look at on an iPhone

Log the iOS version. Repeat with Low Power Mode on. The readout stays on screen. Record the screen if a run looks wrong.

| Check                         | How                                                                                                                                                                                                  | Pass                                                                                                    | Fail                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Smoothness                    | Open and close 10 times per engine, in normal mode and in Low Power Mode, with the readout on and a screen recording                                                                                 | No frame over 33 ms in at least 9 of 10 runs; no flash, blank box, or teleport                          | Repeated dropped frames, a skipped transition, or a visible jump                      |
| Interruptibility mid-close    | Start a close, then tap the thumbnail or flick back up before it ends                                                                                                                                | Reverses from the current position with no jump                                                         | Waits for the animation, snaps, or loses the gesture                                  |
| Swipe-to-dismiss handoff      | Drag down short of the threshold and release; drag past it and release; flick fast                                                                                                                   | Snaps back smoothly, or closes from the dragged position with no jump                                   | Image resets to its resting rect before closing, or the scrim and image desync        |
| Thumbnail off-screen on close | Open a photo near the bottom, navigate to one whose thumbnail is above the fold, close; also collapse the address bar while open                                                                     | Trigger is brought into view and the morph lands on it, or a clean fade; never flies to the wrong place | Lands on stale coordinates, clips under a bar, or flashes                             |
| Zoom and track arbitration    | Pinch during a track fling, pan to the image edge and keep dragging, double-tap, pull while zoomed                                                                                                   | Native scroll and zoom never fight; edge hand-off feels natural; pull is blocked while zoomed           | Stuck gestures, accidental slide change while panning, or page pinch-zoom taking over |
| Safari quirks                 | Log the iOS version. Check address bar resize, safe areas, `view-transition-name` clashes with other fixed elements, object-fit crop interpolation, first-frame decode flash, rubber-band overscroll | Each quirk is either absent or has a one-line mitigation                                                | A quirk with no workaround                                                            |

### Mid-close input — MAR-60

A running FLIP or VT close accepts input through window capture listeners (`registry/ombra/close-input.ts`), because the popup ignores pointers while closing and a view transition sends every hit to the root:

- **Upward pan anywhere:** 12 px up, more vertical than horizontal, reopens the same photo from its current pose. The gesture's speed seeds the spring.
- **Tap on the flying photo or its thumbnail:** reopens the same photo from its current pose.
- **Tap on another thumbnail:** the flying photo fades out in place, and the tapped photo opens from its thumbnail.
- **Anything else** lets the close finish. Fade closes, including reduced motion and off-screen fallbacks, take no input.

A close ends as soon as the photo is within 1.5 px of its thumbnail and the fades are done, which drops the last sliver of spring overshoot. That tail is invisible, but it would keep the page locked and read a swipe as a reversal after the photo looks home.

A view transition cannot run backwards, and its dialog has already unmounted. The handoff reads the live `::view-transition-group` box, mounts a FLIP clone at that frame, skips the transition, and reopens with FLIP. The scrim resumes from the `::view-transition-old(root)` opacity.

The reversal starts from the flying photo's position but does not carry its momentum: a tap reverses from rest, and a pan uses the finger's speed. Real-touch verification on an iPhone is still pending.

### Engine decision — 6 November 2026

- **Default:** WAAPI FLIP. **Optional:** native View Transitions. Both backends ship behind one morph option.
- Reduced motion keeps the fade behavior. The spike's missing `?engine=` already selects `flip`, so the documented decision requires no runtime change here.
- Spring versus cubic remains **undecided**. Marcio is leaning toward spring; keep the comparison available during interaction tuning.
- Further gesture tuning is planned. MAR-60 and MAR-61 track the reversal and zoom/header findings; the gesture model is not signed off by the general phone feedback.

Marcio tested on a real **iPhone 18 Pro**, reported that it worked fine, and found little perceptual difference between VT and FLIP. The phone's iOS version, Low Power Mode coverage, and ten-run frame measurements were not supplied. This is qualitative feedback, not a performance benchmark. The [project decision addendum](https://linear.app/marciobarrios/document/ombra-motion-decisions-flip-default-and-iphone-feedback-28ad1887de32) records the confirmed choice and pending items.

The [5 November iOS Simulator session](SPIKE-IOS-SIMULATOR-2026-11-05.md) records the earlier correctness pass on iPhone 18 Pro / iOS 27.2, including the results, Linear follow-ups, and attached evidence. Its simulator version must not be attributed to the real phone. A 6 November retest of the newer VT fix was attempted but did not run because the simulator remained owned by another session; MAR-59 stays open for verification.

## Spring

`?spring=1` samples a slightly under-damped spring (`registry/ombra/spring.ts`) into a CSS `linear()` easing. Open and close, the pull snap-back, and the zoom release (zoom buttons, double-tap, pinch past the limits) use it. View Transitions take the same easing on the shared pseudo-elements through `--ombra-vt-easing`. A browser without `linear()` gets a nearby `cubic-bezier`, distinct from `cubic-bezier(0.22, 1, 0.36, 1)`. Velocity is the release speed divided by the distance the animation travels, so a fast flick keeps its momentum. `?slow=1` still triples the settle time. Reduced motion stays on the fade.

| Motion                     | Stiffness | Damping | ζ      | Settle   |
| -------------------------- | --------- | ------- | ------ | -------- |
| Open / close morph         | 230       | 25      | ≈ 0.82 | ≈ 500 ms |
| Pull snap and zoom release | 500       | 35      | ≈ 0.78 | ≈ 380 ms |

Overshoot is about 1% on the morph and about 2% on the snap. On an iPhone, compare spring on and off: a downward flick that snaps back, a flick that dismisses, a pinch past the maximum that releases, and an open and close on FLIP and on View Transitions.

## Desktop observations (4 Nov 2026)

Checked with Playwright Chromium and Playwright WebKit on this Linux agent, plus a scripted Chromium session (mouse and keyboard). The in-browser preview tunnel was down, so there is no separate interactive browser session. Playwright WebKit is not iOS Safari.

What worked:

- Chromium and WebKit, desktop and the Pixel 7 / iPhone 13 profiles: open, arrow / Home / End, Escape, focus back on the current thumbnail, engine query, zoom button versus track scroll, Escape during a slow FLIP close. 16 tests passed.
- Desktop Chromium, slow FLIP open: readout **16.8 ms, 0 frames over 33 ms**. A mobile-sized Chromium View Transition open was **16.7 ms, 0 dropped**.
- A mouse drag down on the Chromium track moved the sheet (pull progress about 0.56) and, past the threshold, dismissed into the close morph.
- Zoom in set a transform-only scale of 1.25 and left the track on the current slide. `0` cleared it. The Playwright wheel test pans while zoomed without changing `scrollLeft`.

What looked rough:

- Playwright WebKit, same slow FLIP script, reported a longest frame of **175 ms** on open and **263 ms** after close, with **2** frames over 33 ms. That is a fail by the smoothness rule if it shows up on a phone. It may be this headless WebKit on a VM. Do not treat it as the iPhone result.
- During a slow close the page’s own engine switch shows through the fading scrim, so two switches are visible for a moment. The flying image itself stays a single clone.
- The readout sits on top of the bottom-left thumbnail. Fine for the spike, noisy on a phone.

Not verified here:

- A real iPhone, any iOS version, Low Power Mode, the Safari address bar, safe areas, rubber-band overscroll, and `view-transition-name` clashes.
- Pinch and double-tap with real fingers. Double-tap is implemented for `pointerType: "touch"`; this pass used the zoom buttons, keyboard, and a synthetic wheel.
- Pull with a real touch, as opposed to a mouse drag on the track.
- The off-screen thumbnail case (scroll into view, then morph, or fade if it stays hidden) and interrupting a close by tapping another thumbnail. Escape during a slow close does complete.
