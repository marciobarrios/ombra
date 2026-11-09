# Safari zoom/header investigation — MAR-61

Investigation date: 9 November 2026. [MAR-61](https://linear.app/marciobarrios/issue/MAR-61/investigate-safari-header-cropping-after-pinch-zoom-reset-and-double) belongs to Ombra and remains open. Native Safari telemetry now isolates page zoom and duplicate touch/double-click handling in a repeatable partial header crop. The more severe complete header loss in the [5 November report](SPIKE-IOS-SIMULATOR-2026-11-05.md) and real-iPhone acceptance remain unverified. The before-fix run used PR commit `d34dbb92ef4e918af50c8b275915e8f2b38ebadf`; the final FLIP check used that source plus the accompanying image touch policy and input-ownership fix, served as a local production build at port 3061.

## Evidence and limits

The original `pinch.png` and `double-tap.png` were inspected again. They show a reachable header before the reset/double-tap sequence and missing controls afterward. Neither screenshot contains viewport telemetry. A change in component image scale alone cannot establish why the header disappeared.

The first attempt was blocked by `DEVICE_IN_USE`. After the user released the device, native Safari trials ran on the iPhone 18 Pro simulator, iOS 27.2, portrait 402 × 874 points. No physical iPhone was available. A later execution interruption lost the remaining process handles; when the user requested a retry, another session held the simulator and the supported 1,000 ms wait also failed. That session was left untouched, and the interrupted VT trial is not counted as verified.

The component transforms the image layer separately from the header. Its track has `touch-action: pan-x` at rest and switches to `none` while zoomed. The initial PR added `touch-action: manipulation` to the icon buttons. Native Safari still invoked page zoom on the image surface, so toolbar protection alone was insufficient.

The icon buttons and image zoom layer now use `touch-action: manipulation` to suppress native double-tap zoom on those interaction surfaces. The ancestor track retains its horizontal pan policy and the custom pinch handler. The zoom hook also ignores a compatibility `dblclick` while the last pointer input was touch; a real mouse/pen pointerdown restores independent double-click handling. This avoids depending on a timeout, because Safari can delay compatibility events. The fix does not change the document viewport meta tag or page touch behavior. See [WebKit's explanation](https://webkit.org/blog/5610/more-responsive-tapping-on-ios/) and its [double-tap policy implementation](https://bugs.webkit.org/show_bug.cgi?id=319730). The [Pointer Events specification](https://www.w3.org/TR/pointerevents/#the-touch-action-css-property) also explains why changing `touch-action` after a gesture starts cannot retroactively change browser ownership. Page zoom outside the viewer is preserved by scope; native page-pinch confirmation remains outstanding.

## Native Safari findings

On the before-fix fade viewer, opening forest photo 3 and double-tapping the image at rest was sufficient to produce a partial header crop. No toolbar reset was needed for this reduced reproduction. The trace records trusted touch events followed by a trusted compatibility `dblclick`:

- At 112,547 ms, the touch handler set the component image scale to 2.5.
- At 112,553 ms, Safari delivered `dblclick`; by 112,556 ms the separate double-click handler had toggled the component back to scale 1.
- At 112,624 ms, `visualViewport.scale` was 1.1585 with offsets left 28 and top 32.34375. The image and sheet transforms were both at rest.
- The header rectangle moved from `(0, 0)` to `(-28, -32.34375)` and Close moved from y=12 to y=-20.34375. The counter was clipped, while Close remained reachable. Later pinch/reset/double-tap actions did not restore the page viewport.

This establishes native page zoom/viewport movement as the cause of the reproduced header displacement, with a separate component double-toggle bug. It does not prove that every historical instance of complete header loss has the same trigger.

An intermediate fade fix kept viewport scale at 1 and offsets/header position at 0, but exposed a 334 ms delay between the second touch release and compatibility `dblclick`. A 280 ms deduplication window was insufficient. The final fix uses input ownership instead. Automated coverage includes both immediate and 400 ms delayed compatibility events, with Spring on/off and a real mouse double-click afterward.

The final native FLIP run, Spring off, exercised image double-tap in/out, a requested 1.5× pinch (measured component scale 1.496894), eight rapid Zoom out taps, another image double-tap, a downward pull while zoomed, and Close. All 235 viewer samples retained viewport scale 1, offsets `(0, 0)`, and header y=0. Double-tap toggled the component once in each direction; reset returned to 1; the zoomed pull kept the viewer open; Close remained operable.

The native VT/Spring trial was interrupted before its recording and trace were finalized. Final native fade, VT, browser-bar expansion, edge handoff/fling arbitration, and page pinch outside the viewer are still required, followed by real-iPhone confirmation. No simulator timing or recording here establishes physical-device smoothness.

The issue Resources contain the 11-second native reproduction excerpt (source recording 18–29 seconds), the complete before-fix trace, the final FLIP trace, the final FLIP screenshot, and its recording. Larger originals and intermediate files remain under the local gitignored `test-results/mar61-ios-2026-11-09/` directory. Do not treat those local paths as portable evidence links.

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

## Safari isolation procedure and remaining coverage

Use a fresh page for each case. Open photo 3 (forest), wait for the opening to finish, and record all actions and the trace:

1. Double-tap the image at rest, then double-tap to reset.
2. Use toolbar Zoom in, then repeated Zoom out taps to rest, including a rapid pair near the final reset. Do not double-tap the image in this case.
3. Pinch out by 1.5, then reset only with toolbar taps.
4. Pinch out by 1.5, reset with toolbar taps, then double-tap the image: the original ordering.
5. Repeat the combined case with expanded/collapsed browser bars and while changing their height. Verify Close and both zoom controls remain visible and usable.
6. Recheck pinch during a track fling, image double-tap, reset, pan beyond both image edges, and pull blocking while zoomed. Repeat across VT, FLIP, and fade, with Spring on/off. Check native page pinch zoom outside the viewer after closing.

Interpret the trace by comparing the last good and first bad samples. A changed viewport scale/offset with otherwise stable component state points toward browser viewport movement. A changed image transform at stable viewport geometry points toward component zoom. Header/viewer rectangles or the sheet transform changing at stable viewport scale points toward layout or pull state. The measured reproduction above matches the browser-viewport case. Use the same distinctions when investigating any remaining complete header loss.

## Automated verification

`e2e/zoom-diagnostics.spec.ts` covers the opt-in boundary, a synthetic 1.5x pinch, repeated toolbar reset, image double-click, a 402 × 620 viewport resize, control visibility/operation, and exported telemetry across all three engines. Synthetic pointers exercise component state and are marked untrusted in the export; they cannot reproduce Safari's native pinch or smart-zoom recognizer. Existing zoom/pull/spring tests cover surrounding behavior. Playwright's WebKit and iPhone profile do not establish iOS Safari correctness.

Validation on 9 November: all **184 tests passed** across Chromium, WebKit, Chromium mobile, and WebKit mobile, including 16 diagnostic checks. The suite used a temporary configuration serving this checkout's production build at port 3061 because port 3000 belonged to another checkout. Build (including registry generation), lint, typecheck, formatting, and `git diff --check` passed on Node 24.19.0. The generated registry contains the button safeguard and excludes the docs-only recorder.

The final 200-test Playwright run completed with a saved passed state, including 16 touch/compatibility-event regressions. Build/registry generation, lint, typecheck, formatting, and diff checks passed. An earlier 192-test run had one WebKit navigation sizing failure under concurrent simulator load; its focused rerun passed before the final suite.

Native page zoom and the duplicate component toggle are isolated and corrected for the captured reproduction. The final native engine/browser-bar/edge-handoff matrix and real-iPhone confirmation remain required before accepting the gesture model or closing MAR-61. The PR retains `Refs MAR-61`.
