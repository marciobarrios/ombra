import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

// MAR-16: the open and close morph start and land on the thumbnail, follow it when
// the layout moves mid-flight, and fade when there is no thumbnail to land on.

const flightSelector = "[data-slot=ombra-flight]";

type Rect = { x: number; y: number; width: number; height: number };

type Frame = {
  flight: Rect | null;
  thumb: Rect | null;
  flightReady: boolean;
  thumbHidden: boolean;
  heroShown: boolean;
  heroReady: boolean;
  popup: number | null;
};

type MorphProbe = {
  freezeFrames: () => void;
  thawFrames: () => void;
  pauseFlight: (at: "start" | "end") => Promise<void>;
  resume: (at: "start" | "end") => void;
  record: (thumbIndex: number) => void;
  frames: Frame[];
  sawFlight: boolean;
};

declare global {
  interface Window {
    morphProbe?: MorphProbe;
  }
}

/**
 * Test hooks. `freezeFrames` queues animation frame callbacks until `thawFrames`,
 * so the close's arrival check cannot end a close held at its last frame.
 */
function installProbe() {
  const original = window.requestAnimationFrame.bind(window);
  const originalCancel = window.cancelAnimationFrame.bind(window);
  let queued: Map<number, FrameRequestCallback> | null = null;
  let nextId = 1;
  const flightSelector = "[data-slot=ombra-flight]";

  const box = (element: Element): Rect => {
    const rect = element.getBoundingClientRect();

    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };

  // The morph's own animations: finite and on the document clock. Scroll-driven
  // cues on the thumbnail strip have no end and are left alone.
  const morphAnimations = () =>
    document.getAnimations().filter((animation) => {
      const end = Number(animation.effect?.getComputedTiming().endTime);

      return animation.timeline === document.timeline && Number.isFinite(end);
    });

  const probe: MorphProbe = {
    frames: [],
    sawFlight: false,
    freezeFrames() {
      queued = new Map();
      window.requestAnimationFrame = (callback) => {
        const id = nextId;

        nextId += 1;
        queued?.set(id, callback);

        return -id;
      };

      window.cancelAnimationFrame = (id) => {
        if (id < 0) queued?.delete(-id);
        else originalCancel(id);
      };
    },
    thawFrames() {
      const pending = [...(queued?.values() ?? [])];

      queued = null;
      window.requestAnimationFrame = original;
      window.cancelAnimationFrame = originalCancel;

      for (const callback of pending) original(callback);
    },
    pauseFlight(at) {
      return new Promise((resolve) => {
        const pause = () => {
          for (const animation of morphAnimations()) {
            animation.pause();

            const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);

            animation.currentTime = at === "start" ? 0 : end;
          }

          resolve();
        };

        if (document.querySelector(flightSelector)) {
          pause();

          return;
        }

        const observer = new MutationObserver(() => {
          if (!document.querySelector(flightSelector)) return;

          observer.disconnect();
          pause();
        });

        observer.observe(document.body, { childList: true });
      });
    },
    resume(at) {
      for (const animation of morphAnimations()) {
        // play() at the end would rewind and run the flight again.
        if (at === "end") animation.finish();
        else animation.play();
      }
    },
    record(thumbIndex) {
      probe.frames = [];
      probe.sawFlight = false;

      const tick = () => {
        const flight = document.querySelector(flightSelector);
        const image = flight?.querySelector("img");
        const thumb = document.querySelectorAll("[data-slot=ombra-trigger] img")[thumbIndex];

        const hero = document.querySelector<HTMLImageElement>(
          "[data-slot=ombra-image][data-active=true]",
        );

        const popup = document.querySelector("[data-slot=ombra-viewer]");

        if (flight) probe.sawFlight = true;

        probe.frames.push({
          flight: flight ? box(flight) : null,
          thumb: thumb ? box(thumb) : null,
          flightReady: Boolean(image?.complete && image.naturalWidth > 0),
          thumbHidden: thumb ? getComputedStyle(thumb).visibility === "hidden" : false,
          heroShown: hero ? getComputedStyle(hero).visibility !== "hidden" : false,
          heroReady: Boolean(hero?.complete && hero.naturalWidth > 0),
          popup: popup ? Number(getComputedStyle(popup).opacity) : null,
        });

        original(tick);
      };

      original(tick);
    },
  };

  window.morphProbe = probe;
}

async function boxOf(locator: Locator): Promise<Rect> {
  const rect = await locator.boundingBox();

  if (!rect) throw new Error("no box");

  return rect;
}

function expectSameBox(actual: Rect, expected: Rect, tolerance: number) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(tolerance);
}

// Resampling differs along the edges between the thumbnail and the clone, more so at
// a high device pixel ratio. A landing a few pixels off differs over far more.
const MAX_DIFFERING_SHARE = 0.05;

/** Share of pixels that differ visibly between two same-sized PNG screenshots. */
async function differingShare(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]) => {
      const read = async (base64: string) => {
        const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");

        if (!context) throw new Error("no canvas");

        context.drawImage(bitmap, 0, 0);

        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };

      const [left, right] = await Promise.all([read(first), read(second)]);

      if (left.width !== right.width || left.height !== right.height) return 1;

      let differing = 0;

      for (let offset = 0; offset < left.data.length; offset += 4) {
        let largest = 0;

        for (let channel = 0; channel < 3; channel += 1) {
          largest = Math.max(
            largest,
            Math.abs((left.data[offset + channel] ?? 0) - (right.data[offset + channel] ?? 0)),
          );
        }

        if (largest > 48) differing += 1;
      }

      return differing / (left.width * left.height);
    },
    [a.toString("base64"), b.toString("base64")] as const,
  );
}

// A wide, tall window keeps the first thumbnails in view, so no close needs to scroll.
async function openSpike(page: Page, query: string) {
  await page.addInitScript(installProbe);
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/spike?${query}`);

  // A click before hydration does nothing, and these tests click by coordinates.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const trigger = document.querySelector("[data-slot=ombra-trigger]");

        return trigger ? Object.keys(trigger).some((key) => key.startsWith("__reactProps")) : false;
      }),
    )
    .toBe(true);
}

const viewer = (page: Page) => page.locator("[data-slot=ombra-viewer]");
const triggers = (page: Page) => page.locator("[data-slot=ombra-trigger]");
const thumbImage = (page: Page, index: number) => triggers(page).nth(index).locator("img");

/**
 * Clicks the centre of a box already on screen. `locator.click()` first scrolls the
 * element into view, which would move the page these tests measure.
 */
async function tap(page: Page, locator: Locator) {
  const rect = await boxOf(locator);
  const viewport = page.viewportSize();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;

  expect(y).toBeLessThan(viewport?.height ?? 0);
  await page.mouse.click(x, y);
}

async function waitOpen(page: Page) {
  await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
  await expect(page.locator(flightSelector)).toHaveCount(0);
}

/** A thumbnail other than the first that is fully on screen, so a close lands on it in place. */
async function visibleTarget(page: Page): Promise<number> {
  const index = await page.evaluate(() => {
    const list = [...document.querySelectorAll("[data-slot=ombra-trigger]")];

    return list.findIndex((trigger, position) => {
      const rect = trigger.getBoundingClientRect();

      return position > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
  });

  expect(index).toBeGreaterThan(0);

  return index;
}

test.describe("thumbnail morph", () => {
  test("opens from exactly the thumbnail's box", async ({ page }) => {
    await openSpike(page, "engine=flip&slow=1");

    await thumbImage(page, 0).scrollIntoViewIfNeeded();

    const thumb = await boxOf(thumbImage(page, 0));
    const before = await page.screenshot({ clip: thumb });

    const paused = page.evaluate(() => window.morphProbe?.pauseFlight("start"));

    await tap(page, triggers(page).first());
    await paused;

    expectSameBox(await boxOf(page.locator(flightSelector)), thumb, 0.5);
    expect(await differingShare(page, before, await page.screenshot({ clip: thumb }))).toBeLessThan(
      MAX_DIFFERING_SHARE,
    );

    await page.evaluate(() => {
      window.morphProbe?.resume("start");
    });
    await waitOpen(page);
  });

  test("closes onto the thumbnail of the slide it is on, not the one it opened", async ({
    page,
  }) => {
    await openSpike(page, "engine=flip&slow=1");

    const target = await visibleTarget(page);
    const thumb = await boxOf(thumbImage(page, target));

    const before = await page.screenshot({ clip: thumb });

    await tap(page, triggers(page).first());
    await waitOpen(page);
    await page.locator("[data-slot=ombra-thumbnail]").nth(target).click();
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(
      `${target + 1} / ${photos.length}`,
    );

    await page.evaluate(() => {
      window.morphProbe?.freezeFrames();
    });

    const paused = page.evaluate(() => window.morphProbe?.pauseFlight("end"));

    await page.keyboard.press("Escape");
    await paused;

    expectSameBox(await boxOf(page.locator(flightSelector)), thumb, 0.5);
    await expect(thumbImage(page, target)).toHaveCSS("visibility", "hidden");
    expect(await differingShare(page, before, await page.screenshot({ clip: thumb }))).toBeLessThan(
      MAX_DIFFERING_SHARE,
    );

    await page.evaluate(() => {
      window.morphProbe?.resume("end");
      window.morphProbe?.thawFrames();
    });
    await expect(viewer(page)).toHaveCount(0);
    await expect(page.locator(flightSelector)).toHaveCount(0);
    await expect(thumbImage(page, target)).toHaveCSS("visibility", "visible");
    await expect(triggers(page).nth(target)).toBeFocused();
  });

  test("lands on the photo when the viewport resizes mid-open", async ({ page }) => {
    await openSpike(page, "engine=flip&slow=1");
    await page.evaluate(() => {
      window.morphProbe?.record(0);
    });
    await tap(page, triggers(page).first());
    await expect(page.locator(flightSelector)).toHaveCount(1);
    await page.waitForTimeout(300);
    // An address bar returning takes height from the viewport the viewer fills.
    await page.setViewportSize({ width: 900, height: 860 });
    await expect(page.locator(flightSelector)).toHaveCount(1);
    await waitOpen(page);

    const frames = await page.evaluate(() => window.morphProbe?.frames ?? []);
    const last = frames.findLast((frame) => frame.flight)?.flight;
    const hero = await boxOf(page.locator("[data-slot=ombra-image][data-active=true]"));

    expect(last).toBeTruthy();
    expectSameBox(last ?? hero, hero, 1);
  });

  test("lands on the thumbnail when the page scrolls mid-close", async ({ page }) => {
    await openSpike(page, "engine=flip&slow=1");
    await page.evaluate(() => window.scrollTo(0, 120));
    await tap(page, triggers(page).first());
    await waitOpen(page);
    await page.evaluate(() => {
      window.morphProbe?.record(0);
    });
    await page.keyboard.press("Escape");
    await expect(page.locator(flightSelector)).toHaveCount(1);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, -80));
    await expect(viewer(page)).toHaveCount(0, { timeout: 8_000 });

    const frames = await page.evaluate(() => window.morphProbe?.frames ?? []);
    const last = frames.findLast((frame) => frame.flight);
    const thumb = await boxOf(thumbImage(page, 0));

    const first = frames.find((frame) => frame.flight);

    // The scroll moved the thumbnail while the photo was in the air.
    expect(Math.abs((first?.thumb?.y ?? 0) - (last?.thumb?.y ?? 0))).toBeGreaterThan(60);
    expect(last?.flight).toBeTruthy();
    // A close ends once the photo is within 1.5px of home, on its last frame and after.
    expectSameBox(last?.flight ?? thumb, last?.thumb ?? thumb, 1.5);
    expectSameBox(last?.flight ?? thumb, thumb, 1.5);
  });

  test("leaves the page where it was, so the close needs no scroll", async ({ page }) => {
    await openSpike(page, "engine=flip");
    await page.evaluate(() => window.scrollTo(0, 120));

    const before = await page.evaluate(() => window.scrollY);

    await tap(page, triggers(page).first());
    await waitOpen(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await page.keyboard.press("Escape");
    await expect(viewer(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test("never paints a blank box while the full-size photo is still loading", async ({ page }) => {
    // Hold the full-size source so the slide has only what the clone brought.
    await page.route("**/photos/01-1600.jpg", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      await route.continue();
    });
    await openSpike(page, "engine=flip");
    await page.evaluate(() => {
      window.morphProbe?.record(0);
    });
    await tap(page, triggers(page).first());
    await waitOpen(page);
    await page.waitForTimeout(100);

    const frames = await page.evaluate(() => window.morphProbe?.frames ?? []);

    expect(frames.some((frame) => frame.flight)).toBe(true);

    for (const frame of frames) {
      if (frame.flight) expect(frame.flightReady).toBe(true);

      if (!frame.thumbHidden) continue;

      // Something stands in for the hidden thumbnail on every frame.
      expect(frame.flight !== null || (frame.heroShown && frame.heroReady)).toBe(true);
    }
  });

  for (const engine of ["flip", "vt"] as const) {
    test(`fades when a scroll container clips the thumbnail: ${engine}`, async ({ page }) => {
      await openSpike(page, `engine=${engine}&slow=1`);

      // The grid becomes one narrow column that shows only its first thumbnail and
      // cannot be scrolled to the rest.
      const target = await page.evaluate(() => {
        const first = document.querySelector("[data-slot=ombra-trigger]");
        const grid = first?.parentElement;

        if (!(grid instanceof HTMLElement) || !first) return -1;

        grid.style.columns = "auto";
        grid.style.width = "240px";
        grid.style.overflow = "clip";

        // Measured once the narrow column has laid the thumbnail out again.
        grid.style.height = `${first.getBoundingClientRect().height + 8}px`;

        const list = [...grid.querySelectorAll("[data-slot=ombra-trigger]")];
        const clip = grid.getBoundingClientRect();

        // Laid out, but entirely outside the grid's clip.
        return list.findIndex((trigger) => {
          const rect = trigger.getBoundingClientRect();

          const outside =
            rect.left >= clip.right ||
            rect.right <= clip.left ||
            rect.top >= clip.bottom ||
            rect.bottom <= clip.top;

          return outside && rect.width > 0;
        });
      });

      expect(target).toBeGreaterThan(0);

      await tap(page, triggers(page).first());
      await waitOpen(page);
      await page.locator("[data-slot=ombra-thumbnail]").nth(target).click();
      await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(
        `${target + 1} / ${photos.length}`,
      );
      await page.evaluate((index) => {
        window.morphProbe?.record(index);
      }, target);
      await page.keyboard.press("Escape");
      await expect(viewer(page)).toHaveCount(0, { timeout: 8_000 });

      const probe = await page.evaluate(() => ({
        sawFlight: window.morphProbe?.sawFlight,
        popup: (window.morphProbe?.frames ?? []).flatMap((frame) =>
          frame.popup === null ? [] : [frame.popup],
        ),
      }));

      expect(probe.sawFlight).toBe(false);
      expectFadesOut(probe.popup);
      await expect(triggers(page).nth(target)).toBeFocused();
    });
  }

  test("fades and focuses the nearest thumbnail when the trigger unmounts", async ({ page }) => {
    await openSpike(page, "engine=flip&slow=1");
    await tap(page, triggers(page).first());
    await waitOpen(page);
    await page.locator("[data-slot=ombra-thumbnail]").nth(3).click();
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(`4 / ${photos.length}`);
    await page.evaluate(() => {
      document.querySelectorAll("[data-slot=ombra-trigger]")[3]?.remove();
      window.morphProbe?.record(3);
    });

    const started = Date.now();

    await page.keyboard.press("Escape");
    await expect(viewer(page)).toHaveCount(0, { timeout: 8_000 });

    // A slow fade is 600ms. Waiting for the missing trigger used to take 30 frames.
    expect(Date.now() - started).toBeLessThan(3_000);

    const probe = await page.evaluate(() => ({
      sawFlight: window.morphProbe?.sawFlight,
      popup: (window.morphProbe?.frames ?? []).flatMap((frame) =>
        frame.popup === null ? [] : [frame.popup],
      ),
    }));

    expect(probe.sawFlight).toBe(false);
    expectFadesOut(probe.popup);
    // The fourth thumbnail is gone, so the third (now at index 2) takes focus.
    await expect(triggers(page).nth(2)).toBeFocused();
  });
});

/** The viewer fades from where it was, never jumping out in one step. */
function expectFadesOut(opacities: number[]) {
  expect(opacities.length).toBeGreaterThan(2);
  expect(opacities[0]).toBeGreaterThan(0.8);

  for (let index = 1; index < opacities.length; index += 1) {
    expect(opacities[index]).toBeLessThanOrEqual((opacities[index - 1] ?? 1) + 0.001);
  }
}
