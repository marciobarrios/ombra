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
    ombraHome?: Frame;
    ombraHold?: () => void;
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

/** Records the flight on every animation frame and captures its resting reference separately. */
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

    // The first flight frame can already be displaced in Linux WebKit. Keep the
    // resting reference separate: input helpers must still wait for a live flight,
    // and rapid-cycle tests can start recording after a VT has removed the viewer.
    const hero = document.querySelector("[data-slot=ombra-image][data-active=true]");
    const viewer = document.querySelector("[data-slot=ombra-viewer]");

    window.ombraHome = undefined;

    if (hero && viewer?.getAttribute("data-phase") === "open") {
      const home = hero.getBoundingClientRect();

      window.ombraHome = {
        t: performance.now(),
        cx: home.x + home.width / 2,
        cy: home.y + home.height / 2,
        width: home.width,
        height: home.height,
        scrim: readScrim(),
      };
    }

    requestAnimationFrame(tick);
  });
}

/** Freezes the close in the page, so the input below cannot lose a race with the runner. */
function holdClose() {
  for (const animation of document.getAnimations()) {
    const effect = animation.effect;

    if (!(effect instanceof KeyframeEffect)) continue;

    const target = effect.target;

    const ours =
      effect.pseudoElement?.startsWith("::view-transition") ||
      target?.matches(
        "[data-slot=ombra-flight], [data-slot=ombra-backdrop], [data-slot=ombra-viewer]",
      );

    if (ours) animation.pause();
  }
}

async function waitForMidFlight(page: Page, travel = 40) {
  await page.evaluate(`(new Promise((resolve, reject) => {
    const hold = ${holdClose.toString()};
    const started = performance.now();

    const tick = () => {
      const frames = window.ombraFrames ?? [];
      // One live sample is enough with a captured resting reference. Waiting
      // for three frames can let the close finish on a busy WebKit runner.
      const first = window.ombraHome ?? frames[0];
      const last = frames.at(-1);

      if (
        first &&
        last &&
        Math.hypot(last.cx - first.cx, last.cy - first.cy) >= ${travel}
      ) {
        hold();
        resolve(undefined);

        return;
      }

      if (performance.now() - started > 8000) {
        reject(new Error("the photo never left home"));

        return;
      }

      requestAnimationFrame(tick);
    };

    tick();
  }))`);
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
  const frames = await page.evaluate(() => {
    const home = window.ombraHome;

    if (!home) throw new Error("the resting photo was not recorded");

    return [home, ...(window.ombraFrames ?? [])];
  });

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
      await page.evaluate(`window.ombraHold = ${holdClose.toString()}`);
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
                    window.ombraHold?.();
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
        await recordFrames(page);

        // Later cycles start close to the thumbnail, so there may be little travel left.
        await waitForMidFlight(page, 0);
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

    test("ends once the photo looks home instead of waiting out the animation", async ({
      page,
    }) => {
      await openViewer(page, `engine=${engine}&slow=1`);

      const result = await page.evaluate(
        () =>
          new Promise<{ midFlight: boolean; nearHome: boolean }>((resolve, reject) => {
            const started = performance.now();

            const closeAnimations = () =>
              document.getAnimations().filter((animation) => {
                const effect = animation.effect;

                if (!(effect instanceof KeyframeEffect)) return false;

                return (
                  effect.pseudoElement?.startsWith("::view-transition") ||
                  effect.target?.matches(
                    "[data-slot=ombra-flight], [data-slot=ombra-backdrop], [data-slot=ombra-viewer]",
                  )
                );
              });

            const running = () =>
              document.querySelector("[data-slot=ombra-flight]") !== null ||
              document
                .getAnimations()
                .some(
                  (animation) =>
                    animation.effect instanceof KeyframeEffect &&
                    animation.effect.pseudoElement === "::view-transition-group(ombra-shared)",
                );

            // Paused animations cannot end by themselves, so only the early finish can
            // end this close, and only from the position it was told to check.
            const seek = (fraction: number) => {
              for (const animation of closeAnimations()) {
                const end = Number(animation.effect?.getComputedTiming().endTime);

                animation.pause();
                animation.currentTime = end * fraction;
              }
            };

            const afterDelay = (delay: number, then: () => void) => {
              window.setTimeout(then, delay);
            };

            const waitForFlight = () => {
              if (performance.now() - started > 8000) {
                reject(new Error("the close never started"));

                return;
              }

              if (!running() || closeAnimations().length === 0) {
                requestAnimationFrame(waitForFlight);

                return;
              }

              seek(0.3);
              afterDelay(400, () => {
                const midFlight = running();

                seek(0.97);
                afterDelay(1500, () => {
                  resolve({ midFlight, nearHome: running() });
                });
              });
            };

            const close = document.querySelector("[data-slot=ombra-close]");

            if (close instanceof HTMLElement) close.click();

            requestAnimationFrame(waitForFlight);
          }),
      );

      expect(result.midFlight, "a close that is still travelling should keep running").toBe(true);
      expect(result.nearHome, "a close that looks home should end by itself").toBe(false);
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
