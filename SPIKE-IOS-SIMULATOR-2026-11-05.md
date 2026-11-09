# iOS Simulator correctness session — 5 November 2026

This is pass 1 of [MAR-12](https://linear.app/marciobarrios/issue/MAR-12/iphone-test-session-and-morph-engine-decision). The simulator session ran through T3 Code's Device panel, using Safari on **iPhone 18 Pro, iOS 27.2**, in portrait (402 × 874 points). The page tested was <https://ombra-navy.vercel.app/spike>.

The simulator pass found a reproducible VT close failure and limitations in close interruption and zoom/layout arbitration. **The pass itself did not decide the engine or spring default.** The confirmed engine choice and pending retest are recorded in the 6 November follow-up below. No product code was changed.

Local source inspected for diagnosis: `7373d3b7c7e3cb7acea421e8ab03cff604a8709f`. The hosted deployment's commit was not verified, so the source explanations below are candidate causes, separate from the observed Safari behavior.

These are historical observations from that session, not a retest of later fixes on `main`. Since the session, [PR #2](https://github.com/marciobarrios/ombra/pull/2) merged a fix for the VT fallback described in finding 1 and several pull/zoom fixes. Reproduce against that newer baseline before implementing another fix; its iOS Simulator verification is not recorded here.

## Configurations exercised

“Normal” below means the page's slow-motion switch was off. It does not mean a physical iPhone power-mode test.

| Engine | Normal speed                  | Slow motion                                                                                               | Spring                                       |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| VT     | Open and pull dismissal       | Open, pull snap-back/dismissal, visible-target close, off-screen-target close, close interruption attempt | On at normal speed; on and off in slow mode  |
| FLIP   | Open and visible-target close | Open, off-screen-target close, zoom/pan, pull snap-back/dismissal, close interruption attempt             | Off at normal speed; on and off in slow mode |
| Fade   | Open and pull dismissal       | Open, off-screen-target close, close interruption attempt, pinch/reset/double-tap sequence                | Off                                          |

No Low Power Mode, 10-run smoothness verdict, or spring preference was tested. Those belong to pass 2 on a real phone. The simulator frame readout varied substantially and was not used to rank engines.

## Results

| Check                                       | VT                                                | FLIP                                                                              | Fade                                                                                           |
| ------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Open, navigate, visible-target close        | Completed                                         | Completed                                                                         | Completed                                                                                      |
| Off-screen thumbnail on close               | **Fail: viewer remains on screen**                | Completed; page reveals photo 1                                                   | Completed; page reveals photo 1                                                                |
| Short downward pull / pull past threshold   | Returned / dismissed                              | Returned / dismissed, including spring                                            | Returned / dismissed                                                                           |
| Reverse a slow close with an upward gesture | No reversal observed                              | No reversal observed                                                              | Inconclusive: gesture arrived after the 600 ms fade could finish                               |
| Initial portrait layout / safe areas        | Controls and strip reachable                      | Controls and strip reachable                                                      | Controls and strip reachable                                                                   |
| Address bar collapsed / expanded            | Viewer remained usable during the exercised pulls | Viewer remained usable during the exercised pulls                                 | Viewer remained usable during the exercised pulls                                              |
| Zoom / track arbitration                    | Not independently repeated under VT               | Short pan retained slide; pull blocked while zoomed; long edge pan advanced track | Pinch enlarged image without enlarging controls; later sequence cropped header (see finding 3) |
| Spring functionality                        | Open and pull close completed                     | Open, short pull, dismissal, and close completed                                  | Not tested                                                                                     |

“Completed” records the observed endpoint and usable UI. It is not a frame-by-frame approval of every intermediate frame. Real flicks, pinch during a native track fling, and momentum quality still need the phone pass.

## Findings and reproduction

### 1. VT cannot close to an off-screen grid thumbnail

1. Load `/spike?engine=vt&slow=1`.
2. Scroll to the bottom and open photo 12 (meadow).
3. Navigate to photo 1 (desert road), whose grid thumbnail is now above the viewport.
4. Press Close.

The viewer remains visible, the underlying page becomes accessible, and the close does not finish. In the recording, Close is tapped at **01:59.6**; the viewer is still present at **02:26** and until the recording ends. A page navigation was used to recover. The VT recording includes an incidental strip selection of photo 9 before navigating to photo 1 with Previous.

The equivalent bottom → photo 12 → Previous eleven times → photo 1 → Close sequence completed with FLIP and fade.

Candidate cause in `registry/ombra/ombra-gallery.tsx`: `requestClose()` leaves `driverRef.current` as `vt` when `canMorph` is false and sets the phase to `closing`. The shared animation effect immediately returns for a VT driver, so neither the reveal/fade fallback nor `finishClose()` runs. Choose a working fallback driver before entering that effect, then repeat this Safari case. This mitigation has not been implemented or verified here.

### 2. Upward input does not reverse a slow VT or FLIP close

With spring and slow motion enabled, open a photo, press Close, then pan upward over the image while the close is running. In both VT and FLIP the close completed; the gesture did not reopen or reverse it. Gesture telemetry places the upward gesture about **0.86–0.89 seconds** after the Close tap.

This fails the requested reversal behavior for this input path. It does not establish whether a thumbnail tap can retarget the FLIP flight: that separate interruption path was not validated. The source disables pulling outside the open phase and disables popup pointer events while closing, which is consistent with the observed result. A reversal needs an explicit input path during closing, followed by another simulator and phone check.

The fade attempt is not a valid mid-close reversal result: its slow close lasts 600 ms and the follow-up gesture began roughly 790 ms after Close.

### 3. A longer zoom/reset sequence leaves the header cropped

Observed sequence in the fade viewer on photo 3 (forest): pinch out by 1.5, use Zoom out repeatedly to return to rest, then double-tap the image. The header shifts beyond the top of the visible page: Close, zoom buttons, counter, and part of the readout disappear. A second image double-tap did not restore those controls. Navigation to a fresh page recovered the layout.

The screenshot proves the cropped layout; the exact trigger is **not isolated**. The sequence includes repeated Zoom out taps as well as the image double-tap. Native Safari zoom/visual-viewport movement is a hypothesis, not a measured cause; no `visualViewport` instrumentation was collected.

Fresh FLIP checks on the road and forest did not reproduce the header crop. Do not label every double-tap as broken, and do not confirm the gesture model from this pass. Next check: isolate repeated toolbar taps from image double-taps, inspect visual-viewport scale/offset, and scope any native gesture suppression to the viewer surface while preserving page zoom accessibility.

## Safari quirks and limits

| Area                                | Observation                                                                                                                  | Mitigation / next check                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Address bar resize                  | Expanded and collapsed bars were exercised; initial controls remained reachable                                              | Retain dynamic viewport sizing and recheck after resolving the cropped-header sequence              |
| Safe areas                          | Portrait header and thumbnail strip initially fit above browser chrome                                                       | Keep inset padding; landscape was not tested                                                        |
| View Transition names               | The selected VT path displayed its image and completed ordinary transitions; no name-clash symptom was observed on this page | Deliberate collisions with other named fixed elements were not injected                             |
| Cover crop → full image             | Mixed-aspect grid photos opened to full-frame images and returned to the grid, except the VT off-screen failure              | Exact crop interpolation through every frame remains unapproved                                     |
| First-frame decode flash            | No persistent blank image was observed                                                                                       | Contact sheets sample the videos sparsely; a one-frame decode flash is not ruled out                |
| Rubber-band / gestures              | Short pulls returned, long pulls dismissed; zoomed pull was blocked                                                          | Full boundary rubber-banding and simultaneous fling/pinch remain for focused follow-up / real touch |
| Background UI visible through scrim | Page controls can be seen behind the viewer, including another engine switch                                                 | Existing spike presentation issue; assess scrim and controls separately from the morph              |

## Recordings and screenshots

The evidence needed to review the three findings is attached to the Linear tasks below. Use those issue links to access the clips and screenshots; no expiring upload URLs or local-only media links are required.

| Follow-up                                                                                                                                                                  | Attached evidence                                            | Source time range                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| [MAR-59: VT close stuck with an off-screen thumbnail](https://linear.app/marciobarrios/issue/MAR-59/fix-vt-close-getting-stuck-when-the-current-thumbnail-is-off-screen)   | 18-second clip and stuck-close screenshot                    | `vt.mp4`, 01:55–02:13; Close at about clip 00:04.6                  |
| [MAR-60: Mid-close reversal input for VT and FLIP](https://linear.app/marciobarrios/issue/MAR-60/make-slow-vt-and-flip-closes-reversible-through-the-viewer-input-path)    | Separate VT and FLIP clips                                   | `normal-and-interruption.mp4`, 00:32–00:43; `flip.mp4`, 02:48–03:02 |
| [MAR-61: Investigate header cropping after zoom/reset](https://linear.app/marciobarrios/issue/MAR-61/investigate-safari-header-cropping-after-pinch-zoom-reset-and-double) | 30-second clip and screenshots before and after the sequence | `normal-and-interruption.mp4`, 02:38–03:08                          |

The clips are trimmed, re-encoded excerpts at 588 × 1280 pixels, with their source offsets recorded above. They were checked for readability and duration. Linear's free plan rejected the full recordings because of its 10 MB per-file limit. The clips are correctness evidence, not frame-time benchmarks.

Full originals remain local under the gitignored `test-results/mar-12-ios-simulator/` directory and are not included in this documentation change. Preserve them before running tools that clear `test-results`. Each main recording has a neighboring `.gesture-telemetry.json` with gesture timestamps; recordings omit the touch overlay. The following index describes those local originals; it does not imply that they are available in a fresh checkout.

| Artifact                                                      | Useful moments                                                                                                                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vt.mp4`                                                      | 00:19 open; 00:38 short pull; 00:45 dismiss; 01:05 open photo 12; 01:59 off-screen Close; stuck through end                                                                                                |
| `flip.mp4`                                                    | 00:12 open photo 12; 00:17–00:23 navigate to 1; 00:33 successful close; 01:03–01:23 zoom/pan; 02:16 spring on; 02:18–02:20 pulls; 02:55 close/interruption attempt                                         |
| `fade.mp4`                                                    | 00:21 open photo 12; 00:26–00:33 navigate to 1; 00:55 successful close; 00:59 normal speed; 01:15–01:17 pulls                                                                                              |
| `normal-and-interruption.mp4`                                 | 00:14–00:20 VT spring; 00:37–00:39 VT interruption; 01:42–01:47 FLIP normal; 02:06–02:08 fade interruption attempt; 02:42 pinch; 02:54–02:59 reset/double-tap; 03:21 crop persists; 04:01 fresh road check |
| `double-tap-repro.mp4`                                        | Fresh FLIP navigation to photo 3; image double-tap without the earlier pinch sequence; header remains reachable                                                                                            |
| `vt-offscreen-close-stuck.png`                                | Viewer remains present after off-screen Close                                                                                                                                                              |
| `pinch.png`                                                   | Image enlarged; header controls remain in place                                                                                                                                                            |
| `double-tap.png`                                              | Header controls disappear after the longer sequence                                                                                                                                                        |
| `forest-before-double-tap.png`, `forest-after-double-tap.png` | Crop not reproduced in the fresh check                                                                                                                                                                     |

Contact sheets (`vt-sheet.png`, `flip-sheet.png`, `fade-sheet.png`, and `normal-sheet.png`) were generated and visually reviewed. They cover the session, but are not sufficient to exclude brief flashes or prove exact interrupt timing.

## Decision and remaining work

The simulator correctness session is recorded. It has failures and incomplete subchecks; it is not an acceptance sign-off. Recheck the newer VT off-screen fallback, validate an actual reversal input path, and isolate the zoom/header crop through MAR-59, MAR-60, and MAR-61. At the end of this pass the default engine, default easing, and final gesture model were undecided.

After the session, Marcio reported testing on a real iPhone and finding little perceptual difference between VT and FLIP. Based on that feedback and the simulator's off-screen-close result, the recommendation was FLIP by default, VT as an option, and fade for reduced motion. This records the recommendation without changing the engine configuration or asserting that the newer VT fix still fails. The phone's iOS version, Low Power Mode results, 10-run frame measurements, and spring preference were not supplied in that feedback.

## Follow-up — 6 November 2026

Marcio confirmed **FLIP default, VT optional** and identified the real test device as an **iPhone 18 Pro**. It worked fine in that qualitative test; he plans to tune the interactions over the next few days. Spring versus cubic is still undecided, with a tentative preference for spring. The phone's iOS version, Low Power Mode coverage, and frame measurements remain unreported. The [project decision addendum](https://linear.app/marciobarrios/document/ombra-motion-decisions-flip-default-and-iphone-feedback-28ad1887de32) records this update alongside MAR-12, MAR-15, and MAR-16.

The production alias `ombra-navy.vercel.app` was verified READY at commit `8c3246f26e1f492f4b4df8bd01e2edf3bf14dfc4`, which includes the newer VT fallback fix. A targeted Safari retest was attempted on the iOS Simulator, but another session retained the device after the supported wait/retry. **No new test ran and no pass/fail result is claimed.** MAR-59 remains open to verify closes to thumbnails above and below the viewport in normal and slow motion, including trigger reveal or clean fade, focus return, and restored page scrolling. The historical findings above are unchanged.

## Follow-up — 9 November 2026

The [off-screen close regression suite](e2e/offscreen-close.spec.ts) replaces the single below-viewport, normal-speed check with an above/below-target and normal/slow matrix for VT, FLIP, fade, and VT with reduced motion. It checks that the popup, backdrop, and flight clone are removed from the DOM; focus returns to the current trigger; the target is revealed; scroll-lock styles, inert state, background accessibility, and image transition names return to their initial state; and the viewer can open and close again. Desktop WebKit and Chromium profiles also receive wheel input after close. Playwright does not support wheel input in mobile WebKit, so that profile checks programmatic page movement alongside style restoration; this does not verify native touch scrolling.

Validation on Node 24: the production build, lint, format check, typecheck, and full Playwright suite passed (228 tests, including 64 off-screen matrix cases across the four browser projects). Temporarily disabling the VT close fallback made both normal-speed Chromium direction cases fail at the DOM-removal assertion with the viewer still mounted. The original source was restored and the production build passed again. Product code is unchanged.

The initial Simulator attempt used T3's Device panel for iPhone 18 Pro / iOS 27.2 and the local production build at `http://127.0.0.1:3000/spike?engine=vt`. Safari could not open: `DEVICE_IN_USE` reported a Padelaso session created on 5 November. Its owning thread was confirmed completed, with the last recorded UI action on 5 November at 14:38 UTC. The supported 60-second wait still returned the same error, so that attempt ran no test.

After Marcio authorized asking the owning thread to close its session, that thread released it. The supported wait then opened Safari in this thread's own session. The targeted **iOS Safari Simulator matrix passed** on the unchanged production build from `1b80fb66b9a534859c1a300d6d8793484c9854e9`:

| Target direction | Slow motion | Navigation before Close | Result |
| ---------------- | ----------- | ----------------------- | ------ |
| Below viewport   | Off         | Photo 3 → photo 9       | Passed |
| Above viewport   | Off         | Photo 16 → photo 1      | Passed |
| Below viewport   | On          | Photo 1 → photo 9       | Passed |
| Above viewport   | On          | Photo 16 → photo 1      | Passed |

All app opens, navigation taps, closes, scrolling gestures, and recordings used the session-bound `agent-device` command through T3's Device panel. Safari reported native View Transition API support and the viewer selected `vt`. The expanded gallery now has 30 photos; the above-target cases started at the bottom of that grid rather than using the historical 12-photo layout.

To verify cleanup beyond the accessibility tree, a temporary localhost proxy on port 3001 injected read-only DOM sampling into the production HTML from port 3000. It recorded state changes every 100 ms and click-time snapshots without driving navigation or changing product behavior. For every case, telemetry confirmed that the selected trigger was completely outside the viewport before Close, a fallback flight clone ran after reveal, and the trigger became fully visible. The popup, backdrop, and clone were removed; focus returned to the current slide's trigger; scroll-lock styles returned to their initial values; and inert attributes, hidden background triggers, and image transition names were clear. A subsequent native swipe moved the page by 133–159 CSS pixels in each case. Four recordings and a machine-checked JSON summary preserve this run locally. The automation session was closed afterward to release its claim.

These are Simulator correctness results. Sampling and contact-sheet review do not establish frame-by-frame crop fidelity or physical-device smoothness. FLIP, fade, and reduced-motion regressions passed in Playwright; this targeted native pass exercised VT only. Real-iPhone verification was still outstanding at the end of this Simulator pass; the subsequent manual result is recorded below.

### Real-iPhone acceptance

Marcio reported that every check in the guided real-iPhone checklist passed on a physical **iPhone 18 Pro running iOS 27.0.1**, using the PR #11 preview at commit `cd44f2675830ecee32b64c1bd00b7244ca9a91e6`. The checklist covered VT closes to targets above and below the viewport at normal and slow speed, selected-thumbnail reveal or clean fade, no stuck viewer/overlay, page scrolling and reopening after close, and FLIP, fade, and Reduce Motion smoke checks.

This is Marcio's manual acceptance report, separate from the Simulator's instrumented DOM/focus/cleanup evidence and the 228 automated checks. It does not claim a new instrumented physical-device trace or measured smoothness result. Together, these results satisfy MAR-59's remaining verification scope. PR #11 can now use `Fixes MAR-59`; the issue remains In Review pending merge.
