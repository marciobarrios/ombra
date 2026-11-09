import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

const firstPhoto = "Desert road through red rock toward a distant peak";
const flightSelector = "[data-slot=ombra-flight]";
const MAX_PX_PER_MS = 2;
const MAX_SCRIM_PER_MS = 0.005;

type Frame = { t: number; cx: number; cy: number; width: number; height: number; scrim: number };

declare global {
  interface Window {
    ombraFrames?: Frame[];
  }
}

async function openViewer(page: Page, query: string) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/spike?${query}`);
  await page.getByRole("button", { name: firstPhoto }).click();
  await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open", {
    timeout: 10_000,
  });
  await expect(page.locator(flightSelector)).toHaveCount(0);
}

/** Records the flying photo's frame on every animation frame, from either engine. */
async function recordFrames(page: Page) {
  await page.evaluate(() => {
    const frames: Frame[] = [];

    window.ombraFrames = frames;

    let scrim = 1;

    const readScrim = () => {
      const backdrop = document.querySelector("[data-slot=ombra-backdrop]");

      if (backdrop) {
        scrim = Number(getComputedStyle(backdrop).opacity);

        return scrim;
      }

      // During a view transition the scrim only exists in the old root snapshot. A
      // pseudo-element that does not exist reads as 1, and the frame between the
      // transition ending and the dialog mounting has neither, so keep the last value.
      const root = document.documentElement;
      const group = getComputedStyle(root, "::view-transition-group(ombra-shared)");

      if (Number.parseFloat(group.width) > 0) {
        scrim = Number(getComputedStyle(root, "::view-transition-old(root)").opacity);
      }

      return scrim;
    };

    // The viewer's own requestAnimationFrame can start the fade after this callback
    // but before paint, so a frame only flashed if the scrim is still up afterwards.
    const afterPaint = new MessageChannel();

    afterPaint.port1.onmessage = () => {
      const frame = frames.at(-1);

      if (frame) frame.scrim = Math.min(frame.scrim, readScrim());
    };

    const tick = () => {
      const painted = readScrim();
      const flight = document.querySelector("[data-slot=ombra-flight]");

      const group = getComputedStyle(
        document.documentElement,
        "::view-transition-group(ombra-shared)",
      );

      const groupWidth = Number.parseFloat(group.width);

      if (flight) {
        const rect = flight.getBoundingClientRect();
        const inset = /inset\(([\d.]+)%(?: ([\d.]+)%)?/.exec(getComputedStyle(flight).clipPath);
        const block = Number.parseFloat(inset?.[1] ?? "0") / 100;
        const inline = Number.parseFloat(inset?.[2] ?? inset?.[1] ?? "0") / 100;

        frames.push({
          t: performance.now(),
          cx: rect.x + rect.width / 2,
          cy: rect.y + rect.height / 2,
          width: rect.width * (1 - inline * 2),
          height: rect.height * (1 - block * 2),
          scrim: painted,
        });
      } else if (groupWidth > 0) {
        const matrix = new DOMMatrix(group.transform === "none" ? undefined : group.transform);
        const height = Number.parseFloat(group.height);

        frames.push({
          t: performance.now(),
          cx: matrix.e + groupWidth / 2,
          cy: matrix.f + height / 2,
          width: groupWidth,
          height,
          scrim: painted,
        });
      }

      afterPaint.port2.postMessage(0);
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

async function waitForMidFlight(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const frames = window.ombraFrames ?? [];
          const first = frames[0];
          const last = frames.at(-1);

          return first && last ? Math.hypot(last.cx - first.cx, last.cy - first.cy) : 0;
        }),
      { intervals: [16] },
    )
    .toBeGreaterThan(40);
}

function swipeStart(page: Page) {
  const viewport = page.viewportSize();

  if (!viewport) throw new Error("no viewport");

  return { x: viewport.width / 2, y: viewport.height * 0.7 };
}

// Close windows are short and each mouse call is a round trip, so the pointer is
// already in place and the first move is past the reversal threshold.
async function swipeUp(page: Page) {
  const { x, y } = swipeStart(page);

  await page.mouse.down();
  await page.mouse.move(x, y - 40);
  await page.mouse.move(x, y - 80);
  await page.mouse.up();
}

async function pressCloseWithPointerReady(page: Page) {
  const { x, y } = swipeStart(page);

  await page.mouse.move(x, y);
  await page.locator("[data-slot=ombra-close]").evaluate((node) => {
    if (node instanceof HTMLElement) node.click();
  });
}

/** Checks a frame trace for the snap this issue is about: no large single-frame move. */
async function expectNoJump(page: Page) {
  const frames = await page.evaluate(() => window.ombraFrames ?? []);

  expect(frames.length).toBeGreaterThan(10);

  const first = frames[0];
  const last = frames.at(-1);
  let largest = 0;
  let farthest = 0;
  let scrimRise = 0;
  let largestResize = 0;

  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const frame = frames[index];

    if (!previous || !frame) continue;

    // Mounting the viewer can drop a frame, and fast motion legitimately covers more
    // ground across a long one. A snap moves far without the time to explain it.
    const elapsed = frame.t - previous.t;
    const travel = Math.hypot(frame.cx - previous.cx, frame.cy - previous.cy);
    const resize = Math.abs(frame.width - previous.width);
    const rise = Math.max(0, frame.scrim) - Math.max(0, previous.scrim);

    largest = Math.max(largest, travel - elapsed * MAX_PX_PER_MS);
    largestResize = Math.max(largestResize, resize - elapsed * MAX_PX_PER_MS);
    scrimRise = Math.max(scrimRise, rise - elapsed * MAX_SCRIM_PER_MS);

    if (first) farthest = Math.max(farthest, Math.hypot(frame.cx - first.cx, frame.cy - first.cy));
  }

  if (!first || !last) throw new Error("no frames");

  const settled = Math.hypot(last.cx - first.cx, last.cy - first.cy);

  expect(farthest, "the photo should have left home").toBeGreaterThan(40);
  expect(settled, "the photo should have come back").toBeLessThan(farthest / 2);
  expect(largest, "the photo should not jump between frames").toBeLessThan(60);
  expect(largestResize, "the photo should not resize abruptly").toBeLessThan(60);
  expect(scrimRise, "the scrim should not flash").toBeLessThan(0.3);
}

async function expectCleanlyOpen(page: Page) {
  const viewer = page.locator("[data-slot=ombra-viewer]");

  await expect(viewer).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
  await expect(page.locator(flightSelector)).toHaveCount(0);
  await expect(page.locator("[data-slot=ombra-backdrop]")).toHaveCSS("opacity", "1");
  await expect(viewer).toHaveCSS("opacity", "1");
  expect(await viewer.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  const active = page.locator("[data-slot=ombra-image][data-active=true]");

  await expect(active).toBeVisible();
}

async function expectCleanlyClosed(page: Page) {
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
  await expect(page.locator(flightSelector)).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const inert = document.querySelectorAll("[inert], [data-base-ui-inert]").length;
        const root = getComputedStyle(document.documentElement).overflow;
        const body = getComputedStyle(document.body).overflow;
        const pull = document.documentElement.style.getPropertyValue("--ombra-pull-live");

        return { inert, locked: root === "hidden" || body === "hidden", pull: pull || "0" };
      }),
    )
    .toEqual({ inert: 0, locked: false, pull: "0" });
}

for (const engine of ["flip", "vt"] as const) {
  test.describe(`${engine} close reversal`, () => {
    test("an upward gesture reverses from the current pose", async ({ page }) => {
      await openViewer(page, `engine=${engine}&slow=1&spring=1`);
      await recordFrames(page);
      await pressCloseWithPointerReady(page);
      await waitForMidFlight(page);
      await swipeUp(page);
      await expectCleanlyOpen(page);
      await expectNoJump(page);
    });

    test("an upward gesture reverses without the spring", async ({ page }) => {
      await openViewer(page, `engine=${engine}&slow=1`);
      await recordFrames(page);
      await pressCloseWithPointerReady(page);
      await waitForMidFlight(page);
      await swipeUp(page);
      await expectCleanlyOpen(page);
      await expectNoJump(page);
    });

    test("tapping the target thumbnail reverses the close", async ({ page }) => {
      await openViewer(page, `engine=${engine}&slow=1`);
      await recordFrames(page);
      const box = await page.locator("[data-slot=ombra-trigger]").first().boundingBox();

      if (!box) throw new Error("trigger had no box");

      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.locator("[data-slot=ombra-close]").evaluate((node) => {
        if (node instanceof HTMLElement) node.click();
      });
      await waitForMidFlight(page);
      await page.mouse.down();
      await page.mouse.up();
      await expectCleanlyOpen(page);
      await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(`1 / ${photos.length}`);
      await expectNoJump(page);
    });

    test("tapping another thumbnail retargets to that photo", async ({ page }) => {
      await openViewer(page, `engine=${engine}&slow=1&spring=1`);
      await recordFrames(page);
      await page.getByRole("button", { name: "Close", exact: true }).click();

      // The flying photo wins a tap it covers, so wait until it has cleared one.
      const target = await page.evaluate(
        () =>
          new Promise<{ index: number; x: number; y: number }>((resolve, reject) => {
            const started = performance.now();

            const tick = () => {
              const frame = window.ombraFrames?.at(-1);
              const triggers = Array.from(document.querySelectorAll("[data-slot=ombra-trigger]"));

              if (frame) {
                for (const [index, trigger] of triggers.entries()) {
                  if (index === 0) continue;

                  const rect = trigger.getBoundingClientRect();
                  const x = rect.x + rect.width / 2;
                  const y = rect.y + rect.height / 2;

                  const clear =
                    Math.abs(x - frame.cx) > frame.width / 2 + 8 ||
                    Math.abs(y - frame.cy) > frame.height / 2 + 8;

                  if (clear && y > 0 && y < window.innerHeight && rect.height > 0) {
                    resolve({ index, x, y });

                    return;
                  }
                }
              }

              if (performance.now() - started > 4000) {
                reject(new Error("the flying photo never cleared a thumbnail"));

                return;
              }

              requestAnimationFrame(tick);
            };

            tick();
          }),
      );

      await page.mouse.click(target.x, target.y);
      await expectCleanlyOpen(page);
      await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(
        `${target.index + 1} / ${photos.length}`,
      );
    });

    test("rapid close and reopen cycles leave one coherent viewer", async ({ page }) => {
      await openViewer(page, `engine=${engine}&slow=1&spring=1`);

      for (let cycle = 0; cycle < 4; cycle += 1) {
        const { x, y } = swipeStart(page);

        await page.mouse.move(x, y);
        await page.keyboard.press("Escape");
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 180)));
        await swipeUp(page);
        await expect
          .poll(() => page.locator(flightSelector).count(), { timeout: 2_000 })
          .toBeLessThanOrEqual(1);
      }

      await expectCleanlyOpen(page);
      await page.keyboard.press("Escape");
      await expectCleanlyClosed(page);
      await expect(page.getByRole("button", { name: firstPhoto })).toBeFocused();
    });

    test("ends once the photo looks home instead of waiting out the spring", async ({ page }) => {
      await openViewer(page, `engine=${engine}&slow=1&spring=1`);

      const result = await page.evaluate(
        () =>
          new Promise<{ elapsed: number; duration: number; miss: number }>((resolve, reject) => {
            const started = performance.now();
            const root = document.documentElement;
            const trigger = document.querySelector("[data-slot=ombra-trigger]");
            let duration = 0;
            let miss = Number.POSITIVE_INFINITY;

            const isGroup = (animation: Animation) =>
              animation.effect instanceof KeyframeEffect &&
              animation.effect.pseudoElement === "::view-transition-group(ombra-shared)";

            const tick = () => {
              const flight = document.querySelector("[data-slot=ombra-flight]");

              const running = flight
                ? flight.getAnimations()[0]
                : document.getAnimations().find(isGroup);

              if (running?.effect) {
                duration = Number(running.effect.getComputedTiming().duration);

                const group = getComputedStyle(root, "::view-transition-group(ombra-shared)");
                const rect = flight?.getBoundingClientRect();
                const matrix = new DOMMatrix(group.transform === "none" ? "" : group.transform);

                const cx = rect
                  ? rect.x + rect.width / 2
                  : matrix.e + Number.parseFloat(group.width) / 2;

                const cy = rect
                  ? rect.y + rect.height / 2
                  : matrix.f + Number.parseFloat(group.height) / 2;

                const home = trigger?.getBoundingClientRect();

                if (home) {
                  miss = Math.hypot(
                    cx - (home.x + home.width / 2),
                    cy - (home.y + home.height / 2),
                  );
                }
              } else if (duration > 0) {
                resolve({ elapsed: performance.now() - started, duration, miss });

                return;
              }

              if (performance.now() - started > 8000) {
                reject(new Error("the close never ended"));

                return;
              }

              requestAnimationFrame(tick);
            };

            const close = document.querySelector("[data-slot=ombra-close]");

            if (close instanceof HTMLElement) close.click();

            requestAnimationFrame(tick);
          }),
      );

      expect(result.elapsed, "the invisible tail should be cut").toBeLessThan(
        result.duration * 0.9,
      );
      expect(result.miss, "the photo should be home when the close ends").toBeLessThan(4);
      await expectCleanlyClosed(page);
    });

    test("a downward or sideways gesture lets the close finish", async ({ page }) => {
      await openViewer(page, `engine=${engine}&slow=1`);
      await page.keyboard.press("Escape");

      const viewport = page.viewportSize();

      if (!viewport) throw new Error("no viewport");

      await page.mouse.move(viewport.width / 2, viewport.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(viewport.width / 2 + 40, viewport.height * 0.6, { steps: 4 });
      await page.mouse.up();
      await expectCleanlyClosed(page);
    });
  });
}

test("a real touch pan reverses a flip close without scrolling the page", async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(browserName !== "chromium" || !isMobile, "needs CDP touch input");

  await openViewer(page, "engine=flip&slow=1&spring=1");
  await recordFrames(page);

  const client = await page.context().newCDPSession(page);
  const viewport = page.viewportSize();

  if (!viewport) throw new Error("no viewport");

  const scrollBefore = await page.evaluate(() => window.scrollY);

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await waitForMidFlight(page);

  const x = Math.round(viewport.width / 2);
  const y = Math.round(viewport.height * 0.7);

  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });

  for (let step = 1; step <= 6; step += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - step * 15 }],
    });
  }

  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expectCleanlyOpen(page);
  await expectNoJump(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test("reduced motion closes cleanly and ignores input during the close", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/spike?engine=flip&slow=1&spring=1");
  await page.getByRole("button", { name: firstPhoto }).click();
  await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
  const { x, y } = swipeStart(page);

  await page.mouse.move(x, y);
  await page.keyboard.press("Escape");
  await swipeUp(page);
  await expectCleanlyClosed(page);
});
