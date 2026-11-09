# Safari zoom/header investigation — MAR-61

Investigation date: 9 November 2026. Base source: `1b80fb66b9a534859c1a300d6d8793484c9854e9` plus this change. [MAR-61](https://linear.app/marciobarrios/issue/MAR-61/investigate-safari-header-cropping-after-pinch-zoom-reset-and-double) belongs to Ombra and remains open. The original crop is confirmed by the [5 November report](SPIKE-IOS-SIMULATOR-2026-11-05.md); its cause is still unconfirmed.

## Evidence and limits

The original `pinch.png` and `double-tap.png` were inspected again. They show a reachable header before the reset/double-tap sequence and missing controls afterward. Neither screenshot contains viewport telemetry. A change in component image scale alone cannot establish why the header disappeared.

T3 discovered the iPhone 18 Pro simulator running iOS 27.2. Both the initial Safari open and a supported 1,000 ms wait returned `DEVICE_IN_USE` because another session retained the device. That session was left untouched. **No new iOS sequence or recording ran.** No physical iPhone was available in device discovery.

The component transforms the image layer separately from the header. Its track has `touch-action: pan-x` at rest and switches to `none` while zoomed. The header icon buttons previously had the default `auto` touch action. Native Safari zoom after repeated toolbar taps is therefore a candidate worth isolating, not a confirmed diagnosis or an engine-specific defect.

The icon buttons now use `touch-action: manipulation`, which suppresses native double-tap zoom while allowing native pinch zoom on those controls. This is a scoped safeguard; it does not change the document viewport meta tag or page touch behavior. See [WebKit's explanation](https://webkit.org/blog/5610/more-responsive-tapping-on-ios/) and its [double-tap policy implementation](https://bugs.webkit.org/show_bug.cgi?id=319730). The [Pointer Events specification](https://www.w3.org/TR/pointerevents/#the-touch-action-css-property) also explains why changing `touch-action` after a gesture starts cannot retroactively change browser ownership. Image gesture handling is unchanged in this investigation.

## Capture a recurrence

Open `/spike?engine=fade&debug=zoom` on the build under test. Record the exact deployment/source revision, iOS version, device, orientation, browser-bar state, Spring setting, and a screen recording alongside the trace. Change the engine to repeat with `flip` and `vt`.

Diagnostics run only with `debug=zoom` and stay outside the registry. They keep at most 1,200 samples in memory, dropping the oldest. While the viewer is mounted, measurements run every 100 ms. Pointer moves are throttled to the same interval; pointer down/up/cancel, clicks, double-clicks, window resize, and visual viewport resize/scroll also create samples. The trace includes:

- `visualViewport` scale, size, page position, and offsets.
- Layout viewport sizes and window scroll position.
- Viewer/header/Close/zoom-control rectangles, active photo, engine, phase, and zoom/pull flags.
- Computed image and sheet transforms, track touch action, and track scroll position.
- Pointer type, ID, coordinates, target slot, and whether the event was trusted.

Close the viewer and press **Download zoom diagnostics**. If Close is cropped, use Safari Web Inspector on the affected page before reloading:

```js
window.ombraZoomDiagnostics.download();
```

The JSON stays local until explicitly exported. Reload/navigation clears it. Export promptly so the bounded trace retains the start of the sequence. Diagnostic measurements can force layout and affect timing; use this mode for correctness diagnosis, then turn it off for performance evaluation.

## Isolation procedure still to run in Safari

Use a fresh page for each case. Open photo 3 (forest), wait for the opening to finish, and record all actions and the trace:

1. Double-tap the image at rest, then double-tap to reset.
2. Use toolbar Zoom in, then repeated Zoom out taps to rest, including a rapid pair near the final reset. Do not double-tap the image in this case.
3. Pinch out by 1.5, then reset only with toolbar taps.
4. Pinch out by 1.5, reset with toolbar taps, then double-tap the image: the original ordering.
5. Repeat the combined case with expanded/collapsed browser bars and while changing their height. Verify Close and both zoom controls remain visible and usable.
6. Recheck pinch during a track fling, image double-tap, reset, pan beyond both image edges, and pull blocking while zoomed. Repeat across VT, FLIP, and fade, with Spring on/off. Check native page pinch zoom outside the viewer after closing.

Interpret the trace by comparing the last good and first bad samples. A changed viewport scale/offset with otherwise stable component state points toward browser viewport movement. A changed image transform at stable viewport geometry points toward component zoom. Header/viewer rectangles or the sheet transform changing at stable viewport scale points toward layout or pull state. These are diagnostic distinctions; no one of them has been observed in a new Safari reproduction yet.

## Automated verification

`e2e/zoom-diagnostics.spec.ts` covers the opt-in boundary, a synthetic 1.5x pinch, repeated toolbar reset, image double-click, a 402 × 620 viewport resize, control visibility/operation, and exported telemetry across all three engines. Synthetic pointers exercise component state and are marked untrusted in the export; they cannot reproduce Safari's native pinch or smart-zoom recognizer. Existing zoom/pull/spring tests cover surrounding behavior. Playwright's WebKit and iPhone profile do not establish iOS Safari correctness.

Validation on 9 November: all **184 tests passed** across Chromium, WebKit, Chromium mobile, and WebKit mobile, including 16 diagnostic checks. The suite used a temporary configuration serving this checkout's production build at port 3061 because port 3000 belonged to another checkout. Build (including registry generation), lint, typecheck, formatting, and `git diff --check` passed on Node 24.19.0. The generated registry contains the button safeguard and excludes the docs-only recorder.

The cause, actual browser-bar resizing, native edge handoff/pull arbitration, and the original combined sequence still need Safari recordings and telemetry. Real-iPhone confirmation remains required before accepting the gesture model or closing MAR-61. Any PR for this partial investigation must use `Refs MAR-61`.
