# Performance budget

The core is the gallery and album recipes bundled together, zoom included. React, Base UI, and `cn` stay outside that number. CI fails when the bundle grows past the ceiling, and when a sampled Chromium frame or interaction does. The same report is on the docs site at `/performance`.

| Check                           | Ceiling                       | Where                                 |
| ------------------------------- | ----------------------------- | ------------------------------------- |
| Core JavaScript, gzip           | 32 KB                         | `pnpm budget`                         |
| Animated properties             | transform, opacity, clip-path | Chromium, during the gestures below   |
| INP for open, close, navigation | 200 ms                        | Chromium event timing                 |
| Longest frame in CI             | 50 ms                         | Chromium rAF and long-animation-frame |
| Longest frame on an iPhone      | 33 ms                         | Spike readout, by hand                |
| Animation library               | none in the core              | `pnpm budget`                         |

## Size

The pre-spike proposal was 12 KB gzipped. The shipped recipes measure 28,871 bytes, so the enforced ceiling is 32 KB (32 × 1024 bytes). 3,897 bytes of headroom remain, for the v0.1 and v1 features that go into the gallery bundle: image loading, deep links, windowing and video. Each one still records its growth here. The first ceiling was 27 KB, set when the core measured 26,252 bytes; it moved to 32 KB once captions left 78 bytes. Zoom and track arbitration added 571 bytes, keeping a zoomed photo above its neighbours 17, right-to-left scroll clamps 94, and the thumbnail strip's landmark and one-photo rule 56, and the natural-size zoom ceiling 298. `OmbraTitle` saved 6, and the trackpad momentum guard after a close added 138, and a trackpad close's focus return without a ring 162. Keeping the page locked through every close saved 37, and naming the album cover by its own text 12. The gallery's layout children and shared tile added 115, and moving the docs' photo credit out of the recipe saved 95.

`pnpm budget` bundles `OmbraGallery` and `OmbraAlbum` with esbuild, minified, packages external. External means `react`, `react-dom`, `@base-ui/react`, and `cn`. Gzip is zlib level 9. The script also scans registry imports and `registry.json` dependencies for Motion, GSAP, anime.js, Popmotion, and React Spring, and exits non-zero if it finds one or if the gzipped size is over 32 KB. The unit test feeds the same check a size one byte over the limit and expects that failure.

The measured 28,871 bytes is locked in `tools/budget/limits.ts`. Updating the core means updating that figure and this report in the same change, and staying under 32 KB.

## What the core is allowed to animate

Motion stays on the compositor: transform, opacity, and clip-path. Two measured exceptions stay on the allow-list. The FLIP clone animates `border-radius` in its own effect so the corner stays 6 px on screen while the moving effect stays `transform` only. A pull snap animates the custom property `--ombra-pull-live`, which the pull stylesheet turns into transform and opacity, and animates the sheet's radius back to zero with that snap. The Chromium test reads `getAnimations()` during open, pinch, pan, pull, and close, and fails if a keyframe uses anything else.

## Frames and interactions in Chromium

`e2e/frame-budget.spec.ts` runs in desktop Chromium, in a `frame-budget` Playwright project. Locally it starts once every other project has finished; in CI it runs on a runner of its own. Either way no other test competes with it for the CPU. It opens the spike on FLIP, warms the first photo, then samples open, an arrow-key slide, a synthetic pinch, a mouse pan, a short pull that snaps back, and close. A gesture that crosses the ceiling starts the sample over, up to three times. Three crossings still fail. A `requestAnimationFrame` loop records every frame delta. `PerformanceObserver` records `long-animation-frame` entries and event timings. The longest frame in each gesture has to be at or below 50 ms, and every event-timing duration in those windows at or below 200 ms. Pinch is dispatched as touch pointers, so it has no trusted interaction id; open, navigation, pan, pull, and close do. Fifty milliseconds is the automated bar because that is where Chromium starts a long animation frame, and because the runner is not an iPhone. A frame that used to be 16 ms and becomes a long task fails this check.

## Reading frame time on an iPhone

The phone bar is 33 ms, one frame at 30 Hz. The spike readout is the procedure. Running it on a device is a separate pass and does not block the automated checks.

1. Open `/spike` on the phone. Note the model, the iOS version, and whether Low Power Mode is on. Repeat the run with Low Power Mode on.
2. The header readout shows the last open and the last close: longest frame, dropped-frame count, and the median frame interval, sampled with `requestAnimationFrame`. A frame counts as dropped at 1.5× that interval, so a steady 30 Hz Low Power Mode run is not a pile of drops. `mid` leaves out the first frame (mount and decode) and the last (settle).
3. Morph: open `/spike?bench=1` and tap **Run 10× per engine**. Don't touch the screen. Pass when, for each engine, the longest frame is at or below 33 ms and `mid` is clean in at least 9 of 10 runs. Screenshot the table.
4. Pull: drag down a short way and release, then drag past the dismiss point. The dismissing pull ends in a close, which the readout records. Pass when that close stays at or below 33 ms and the snap-back does not hold a frame.
5. Pinch and pan: pinch to zoom, pan inside the photo, then pan past the edge. The bench does not drive fingers, so watch the gesture. A held frame fails the 33 ms bar; record a screen capture when one shows. The same gestures are sampled automatically in Chromium.

The surrounding phone checks (engines, off-screen close, zoom arbitration) stay in [SPIKE.md](SPIKE.md).
