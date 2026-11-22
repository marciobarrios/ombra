# Manual iPhone checklist

Playwright runs the suite on Chromium, WebKit, and mobile emulation. Its WebKit is not iOS Safari. Run this list on a physical iPhone against a preview or production deploy, and write down the model, iOS version, URL, and date with the result.

Open `/spike`. FLIP is the default. `?engine=vt` and `?engine=fade` select the other engines. `?slow=1` stretches the morph. `?bench=1` fills the frame-time table (longest frame, frames over the display interval) for ten opens and ten closes of each engine. Run the bench once with Low Power Mode off and once with it on, and leave the screen alone while it runs.

## Morph

- [ ] Open and close the first photo ten times on FLIP, then View Transitions, then fade. No flash, blank box, or jump.
- [ ] Repeat the three engines with Low Power Mode on. On the bench, fade's mid-flight count stays at least 9 of 10.
- [ ] Move to another photo, then close. The flight lands on that photo's thumbnail, including one that is scrolled off screen or covered by the address bar.
- [ ] During a slow close, drag back before it lands. The photo reverses from where it is, and does not jump when the motion finishes.

## Pull to dismiss

- [ ] A drag up or down follows the finger. Releasing past the threshold flies to the thumbnail from where the photo was let go. Releasing short of it springs back.
- [ ] A quick short flick closes. A sideways swipe changes the photo and does not start a pull.

## Zoom

- [ ] A pinch follows both fingers. A double-tap zooms at the tap, and a second double-tap returns to the fitted size.
- [ ] Panning a zoomed photo stays on that photo. Dragging past the edge continues into the next photo.
- [ ] A pinch during a fling does not leave a stuck gesture. Pull to dismiss does nothing while the photo is zoomed.
- [ ] Pinch and pan stay smooth: the bench shows no frame over 33 ms.

## Accessibility and chrome

- [ ] VoiceOver: the dialog name matches the photo, a slide change is announced once, the controls can be reached, and focus returns to the thumbnail on close.
- [ ] Portrait and landscape keep the controls inside the safe areas.
