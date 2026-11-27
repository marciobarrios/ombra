import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Performance budget — Ombra",
  description:
    "How Ombra measures its JavaScript budget, interaction latency, and frame time, and how to read the same numbers on an iPhone.",
};

export default function PerformancePage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <p className="font-display text-sm tracking-[0.22em] text-brand">OMBRA</p>
      <h1 className="font-display mt-4 text-5xl leading-none">Performance budget</h1>
      <p className="mt-6 text-lg leading-8 text-foreground/80">
        The core is the gallery and album recipes bundled together, zoom included. React, Base UI,
        and <code className="font-mono text-base">cn</code> stay outside that number. CI fails when
        the bundle grows past the ceiling, and when a sampled Chromium frame or interaction does.
      </p>

      <table className="mt-10 w-full text-left text-sm leading-6">
        <thead className="text-foreground/70">
          <tr className="border-b border-foreground/15">
            <th className="py-2 pr-4 font-medium">Check</th>
            <th className="py-2 pr-4 font-medium">Ceiling</th>
            <th className="py-2 font-medium">Where</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-foreground/10">
            <td className="py-3 pr-4">Core JavaScript, gzip</td>
            <td className="py-3 pr-4">32 KB</td>
            <td className="py-3">
              <code className="font-mono">pnpm budget</code>
            </td>
          </tr>
          <tr className="border-b border-foreground/10">
            <td className="py-3 pr-4">Animated properties</td>
            <td className="py-3 pr-4">transform, opacity, clip-path</td>
            <td className="py-3">Chromium, during the gestures below</td>
          </tr>
          <tr className="border-b border-foreground/10">
            <td className="py-3 pr-4">INP for open, close, navigation</td>
            <td className="py-3 pr-4">200 ms</td>
            <td className="py-3">Chromium event timing</td>
          </tr>
          <tr className="border-b border-foreground/10">
            <td className="py-3 pr-4">Longest frame in CI</td>
            <td className="py-3 pr-4">50 ms</td>
            <td className="py-3">Chromium rAF and long-animation-frame</td>
          </tr>
          <tr className="border-b border-foreground/10">
            <td className="py-3 pr-4">Longest frame on an iPhone</td>
            <td className="py-3 pr-4">33 ms</td>
            <td className="py-3">Spike readout, by hand</td>
          </tr>
          <tr>
            <td className="py-3 pr-4">Animation library</td>
            <td className="py-3 pr-4">none in the core</td>
            <td className="py-3">
              <code className="font-mono">pnpm budget</code>
            </td>
          </tr>
        </tbody>
      </table>

      <h2 className="font-display mt-14 text-3xl">Size</h2>
      <p className="mt-4 leading-7 text-foreground/80">
        The pre-spike proposal was 12 KB gzipped. The shipped recipes measure 28,851 bytes, so the
        enforced ceiling is 32 KB (32 × 1024 bytes). 3,917 bytes of headroom remain, for the v0.1
        and v1 features that go into the gallery bundle: image loading, deep links, windowing and
        video. Each one still records its growth here. The first ceiling was 27 KB, set when the
        core measured 26,252 bytes; it moved to 32 KB once captions left 78 bytes. Zoom and track
        arbitration added 571 bytes, keeping a zoomed photo above its neighbours 17, right-to-left
        scroll clamps 94, and the thumbnail strip&apos;s landmark and one-photo rule 56, and the
        natural-size zoom ceiling 298. <code className="font-mono">OmbraTitle</code> saved 6, and
        the trackpad momentum guard after a close added 138, and a trackpad close's focus return
        without a ring 162. Keeping the page locked through every close saved 37, and naming the
        album cover by its own text 12.
      </p>
      <p className="mt-4 leading-7 text-foreground/80">
        <code className="font-mono">pnpm budget</code> bundles{" "}
        <code className="font-mono">OmbraGallery</code> and{" "}
        <code className="font-mono">OmbraAlbum</code> with esbuild, minified, packages external.
        External means <code className="font-mono">react</code>,{" "}
        <code className="font-mono">react-dom</code>,{" "}
        <code className="font-mono">@base-ui/react</code>, and <code className="font-mono">cn</code>
        . Gzip is zlib level 9. The script also scans registry imports and{" "}
        <code className="font-mono">registry.json</code> dependencies for Motion, GSAP, anime.js,
        Popmotion, and React Spring, and exits non-zero if it finds one or if the gzipped size is
        over 32 KB. The unit test feeds the same check a size one byte over the limit and expects
        that failure.
      </p>

      <h2 className="font-display mt-14 text-3xl">What the core is allowed to animate</h2>
      <p className="mt-4 leading-7 text-foreground/80">
        Motion stays on the compositor: transform, opacity, and clip-path. Two measured exceptions
        stay on the allow-list. The FLIP clone animates{" "}
        <code className="font-mono">border-radius</code> in its own effect so the corner stays 6 px
        on screen while the moving effect stays <code className="font-mono">transform</code> only. A
        pull snap animates the custom property <code className="font-mono">--ombra-pull-live</code>,
        which the pull stylesheet turns into transform and opacity, and animates the sheet&apos;s
        radius back to zero with that snap. The Chromium test reads{" "}
        <code className="font-mono">getAnimations()</code> during open, pinch, pan, pull, and close,
        and fails if a keyframe uses anything else.
      </p>

      <h2 className="font-display mt-14 text-3xl">Frames and interactions in Chromium</h2>
      <p className="mt-4 leading-7 text-foreground/80">
        <code className="font-mono">e2e/frame-budget.spec.ts</code> runs in desktop Chromium. It
        opens the spike on FLIP, warms the first photo, then samples open, an arrow-key slide, a
        synthetic pinch, a mouse pan, a short pull that snaps back, and close. A{" "}
        <code className="font-mono">requestAnimationFrame</code> loop records every frame delta.
        <code className="font-mono"> PerformanceObserver</code> records{" "}
        <code className="font-mono">long-animation-frame</code> entries and event timings. The
        longest frame in each gesture has to be at or below 50 ms, and every event-timing duration
        in those windows at or below 200 ms. Pinch is dispatched as touch pointers, so it has no
        trusted interaction id; open, navigation, pan, pull, and close do. Fifty milliseconds is the
        automated bar because that is where Chromium starts a long animation frame, and because the
        runner is not an iPhone. A frame that used to be 16 ms and becomes a long task fails this
        check.
      </p>

      <h2 className="font-display mt-14 text-3xl">Reading frame time on an iPhone</h2>
      <p className="mt-4 leading-7 text-foreground/80">
        The phone bar is 33 ms, one frame at 30 Hz. The spike readout is the procedure. Running it
        on a device is a separate pass and does not block the automated checks.
      </p>
      <ol className="mt-4 list-decimal space-y-3 pl-5 leading-7 text-foreground/80">
        <li>
          Open{" "}
          <Link href="/spike" className="underline-offset-4 hover:underline">
            /spike
          </Link>{" "}
          on the phone. Note the model, the iOS version, and whether Low Power Mode is on. Repeat
          the run with Low Power Mode on.
        </li>
        <li>
          The header readout shows the last open and the last close: longest frame, dropped-frame
          count, and the median frame interval, sampled with{" "}
          <code className="font-mono">requestAnimationFrame</code>. A frame counts as dropped at
          1.5× that interval, so a steady 30 Hz Low Power Mode run is not a pile of drops.{" "}
          <code className="font-mono">mid</code> leaves out the first frame (mount and decode) and
          the last (settle).
        </li>
        <li>
          Morph: open <code className="font-mono">/spike?bench=1</code> and tap{" "}
          <strong>Run 10× per engine</strong>. Don&apos;t touch the screen. Pass when, for each
          engine, the longest frame is at or below 33 ms and <code className="font-mono">mid</code>{" "}
          is clean in at least 9 of 10 runs. Screenshot the table.
        </li>
        <li>
          Pull: drag down a short way and release, then drag past the dismiss point. The dismissing
          pull ends in a close, which the readout records. Pass when that close stays at or below 33
          ms and the snap-back does not hold a frame.
        </li>
        <li>
          Pinch and pan: pinch to zoom, pan inside the photo, then pan past the edge. The bench does
          not drive fingers, so watch the gesture. A held frame fails the 33 ms bar; record a screen
          capture when one shows. The same gestures are sampled automatically in Chromium.
        </li>
      </ol>
      <p className="mt-4 leading-7 text-foreground/80">
        The rest of the phone checklist (engines, off-screen close, zoom arbitration) stays in the{" "}
        <Link href="/spike" className="underline-offset-4 hover:underline">
          spike
        </Link>{" "}
        notes.
      </p>

      <p className="mt-12">
        <Link
          href="/spike"
          className="inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-sm text-background"
        >
          Open the morph spike
        </Link>
      </p>
    </main>
  );
}
