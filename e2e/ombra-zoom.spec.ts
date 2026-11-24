import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

// MAR-141: zoom is on only where OmbraZoom is rendered. The /spike/zoom bench renders every
// slide with it, none (`?zoom=off`), or only the first (`?zoom=first`).

const items = photos.slice(0, 4);
const first = items[0];
const second = items[1];

if (!first || !second) throw new Error("The bench needs two photos.");

const viewer = (page: Page) => page.locator("[data-slot=ombra-viewer]");
const activeSlide = (page: Page) => page.locator("[data-slot=ombra-slide][data-active=true]");
const activeMedia = (page: Page) => activeSlide(page).locator("[data-slot=ombra-media]");

async function openBench(page: Page, mode: "all" | "first" | "off") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(mode === "all" ? "/spike/zoom" : `/spike/zoom?zoom=${mode}`);
  // A click before hydration does nothing.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const trigger = document.querySelector("[data-slot=ombra-trigger]");

        return trigger ? Object.keys(trigger).some((key) => key.startsWith("__reactProps")) : false;
      }),
    )
    .toBe(true);
  await page.getByRole("button", { name: first?.alt, exact: true }).click();
  await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
  await expect(activeSlide(page)).toHaveAttribute("aria-label", first?.alt ?? "");
}

/** The horizontal scale of the media on screen, whatever wraps it. */
function mediaScale(page: Page) {
  return activeMedia(page).evaluate((node) => {
    const rect = node.getBoundingClientRect();

    if (!(node instanceof HTMLElement)) throw new Error("The media is not an HTML element");

    return rect.width / node.offsetWidth;
  });
}

/** The scale the viewer publishes for consumer styles. */
function publishedZoom(page: Page) {
  return viewer(page).evaluate((node) =>
    Number(getComputedStyle(node).getPropertyValue("--ombra-zoom")),
  );
}

/** Safari's double-tap: two touch pointer pairs, then a compatibility dblclick. */
function doubleTap(target: Locator) {
  return target.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const point = { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 };

    for (const pointerId of [81, 82]) {
      for (const type of ["pointerdown", "pointerup"]) {
        node.dispatchEvent(
          new PointerEvent(type, { bubbles: true, pointerType: "touch", pointerId, ...point }),
        );
      }
    }

    node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, ...point }));
  });
}

/** Two touch pointers spreading apart over a few frames, as the zoom hook sees a pinch. */
function pinch(target: Locator) {
  return target.evaluate(async (node) => {
    const rect = node.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

    const send = (type: string, pointerId: number, clientX: number) => {
      node.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
          pointerId,
          isPrimary: pointerId === 91,
          clientX,
          clientY: y,
        }),
      );
    };

    send("pointerdown", 91, x - 20);
    send("pointerdown", 92, x + 20);
    await frame();

    for (let step = 1; step <= 6; step += 1) {
      send("pointermove", 91, x - 20 - step * 15);
      send("pointermove", 92, x + 20 + step * 15);
      await frame();
    }

    send("pointerup", 91, x - 110);
    send("pointerup", 92, x + 110);
    await frame();
  });
}

type Touch = {
  type: "pointerdown" | "pointermove" | "pointerup";
  id: number;
  dx: number;
  dy: number;
};

/**
 * Plays touch pointers on the track, one frame per entry, as the gesture hooks see a finger.
 * Offsets are from the track's centre. The first finger of each sequence is primary.
 */
function touches(page: Page, frames: Touch[][]) {
  return page.locator("[data-slot=ombra-track]").evaluate(async (node, script) => {
    const rect = node.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const primary = script[0]?.[0]?.id;

    for (const events of script) {
      for (const { type, id, dx, dy } of events) {
        node.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerType: "touch",
            pointerId: id,
            isPrimary: id === primary,
            clientX: x + dx,
            clientY: y + dy,
          }),
        );
      }

      await frame();
    }
  }, frames);
}

/** Two fingers spreading on the track's centre, from `from` to `to` pixels apart on each side. */
function spread(from: number, to: number, steps: number, ids: [number, number] = [91, 92]) {
  return Array.from({ length: steps }, (_, step): Touch[] => {
    const d = from + ((to - from) * (step + 1)) / steps;

    return [
      { type: "pointermove", id: ids[0], dx: -d, dy: 0 },
      { type: "pointermove", id: ids[1], dx: d, dy: 0 },
    ];
  });
}

/** Whether the track has come to rest with a slide in its centre. */
function trackRests(page: Page) {
  return page.locator("[data-slot=ombra-track]").evaluate((node) => {
    const mid = node.getBoundingClientRect().left + node.clientWidth / 2;

    return [...node.querySelectorAll("[data-slot=ombra-slide]")].some((slide) => {
      const box = slide.getBoundingClientRect();

      return Math.abs(box.left + box.width / 2 - mid) <= 2;
    });
  });
}

test.describe("OmbraZoom", () => {
  test("a slide with OmbraZoom zooms by pinch, double-tap and the consumer's buttons", async ({
    page,
  }) => {
    await openBench(page, "all");

    const zoomIn = page.getByRole("button", { name: "Acercar" });
    const zoomOut = page.getByRole("button", { name: "Alejar" });

    await expect(activeSlide(page).locator("[data-slot=ombra-zoom]")).toHaveCount(1);
    await expect(zoomIn).toBeEnabled();
    await expect(zoomOut).toBeDisabled();
    expect(await publishedZoom(page)).toBe(1);

    await pinch(activeMedia(page));
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");
    await expect(zoomOut).toBeEnabled();
    await page.keyboard.press("0");
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");

    await doubleTap(activeMedia(page));
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");
    await expect.poll(() => mediaScale(page)).toBeCloseTo(2.5, 1);
    await expect.poll(() => publishedZoom(page)).toBeCloseTo(2.5, 1);
    await page.keyboard.press("0");
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");
    await expect.poll(() => publishedZoom(page)).toBe(1);

    await zoomIn.click();
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");
    await expect.poll(() => mediaScale(page)).toBeCloseTo(1.25, 2);
    await zoomOut.click();
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");
    await expect(zoomOut).toBeDisabled();
  });

  test("slides without OmbraZoom still pull to dismiss", async ({ page }) => {
    await openBench(page, "off");
    await pinch(activeMedia(page));

    const box = await page.locator("[data-slot=ombra-track]").boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + Math.min(72, box.height / 3);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 200, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
  // MAR-22: the arbitration rows a browser can show. The full table is in
  // e2e/gesture-arbitration.spec.ts.
  test("a pinch while the track glides waits for it to rest, then zooms that slide", async ({
    page,
  }) => {
    await openBench(page, "all");
    // The glide stands in for a fling: the track keeps scrolling with no finger on it.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.locator("[data-slot=ombra-track]").evaluate((node) => {
      const slides = node.querySelectorAll<HTMLElement>("[data-slot=ombra-slide]");
      const step = (slides[1]?.offsetLeft ?? 0) - (slides[0]?.offsetLeft ?? 0);

      node.scrollTo({ left: node.scrollLeft + step, behavior: "smooth" });
    });
    // The fingers land once the track is moving, as they do on a fling.
    await expect.poll(() => trackRests(page)).toBe(false);

    await touches(page, [
      [
        { type: "pointerdown", id: 91, dx: -20, dy: 0 },
        { type: "pointerdown", id: 92, dx: 20, dy: 0 },
      ],
      ...spread(20, 60, 3),
    ]);
    // Never half-zoomed on two slides: nothing scales while the track moves.
    expect(await mediaScale(page)).toBeCloseTo(1, 2);
    await expect.poll(() => trackRests(page)).toBe(true);
    await expect(activeSlide(page)).toHaveAttribute("aria-label", second.alt);

    // The same fingers keep spreading, and the pinch starts on the slide that rested.
    await touches(page, spread(60, 140, 6));
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");
    expect(await trackRests(page)).toBe(true);
    await expect(activeSlide(page).locator("[data-slot=ombra-zoom]")).toHaveAttribute(
      "data-zoomed",
      "true",
    );
    await touches(page, [
      [
        { type: "pointerup", id: 91, dx: -140, dy: 0 },
        { type: "pointerup", id: 92, dx: 140, dy: 0 },
      ],
    ]);

    // Nothing is stuck: the zoom resets, and a later pinch zooms again.
    await page.keyboard.press("0");
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");
    await pinch(activeMedia(page));
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");
  });

  test("a zoomed pan stays on its slide, ignores the pull, and hands off past the edge", async ({
    page,
  }) => {
    await openBench(page, "all");
    await doubleTap(activeMedia(page));
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");

    const scrollLeft = () =>
      page.locator("[data-slot=ombra-track]").evaluate((node) => node.scrollLeft);

    const home = await scrollLeft();

    // A short pan inside the photo moves the photo, never the track.
    await touches(page, [
      [{ type: "pointerdown", id: 71, dx: 0, dy: 0 }],
      ...Array.from({ length: 5 }, (_, step): Touch[] => [
        { type: "pointermove", id: 71, dx: -(step + 1) * 10, dy: (step + 1) * 4 },
      ]),
      [{ type: "pointerup", id: 71, dx: -50, dy: 20 }],
    ]);
    expect(await scrollLeft()).toBe(home);
    await expect(activeSlide(page)).toHaveAttribute("aria-label", first.alt);

    // A vertical drag pans too: the pull is off while zoomed.
    await touches(page, [
      [{ type: "pointerdown", id: 72, dx: 0, dy: 0 }],
      ...Array.from({ length: 8 }, (_, step): Touch[] => [
        { type: "pointermove", id: 72, dx: 0, dy: (step + 1) * 30 },
      ]),
      [{ type: "pointerup", id: 72, dx: 0, dy: 240 }],
    ]);
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
    await expect(viewer(page)).toHaveAttribute("data-pulling", "false");

    // Past the photo's edge the same drag moves the track, and the release pages. The
    // photo at 2.5x reaches its edge after three quarters of its width.
    const width = (await page.locator("[data-slot=ombra-track]").boundingBox())?.width ?? 0;
    const stride = (width * 1.4) / 16;

    await touches(page, [
      [{ type: "pointerdown", id: 73, dx: 0, dy: 0 }],
      ...Array.from({ length: 16 }, (_, step): Touch[] => [
        { type: "pointermove", id: 73, dx: -(step + 1) * stride, dy: 0 },
      ]),
      [{ type: "pointerup", id: 73, dx: -16 * stride, dy: 0 }],
    ]);
    await expect(activeSlide(page)).toHaveAttribute("aria-label", second.alt);
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");
    await expect.poll(() => trackRests(page)).toBe(true);
  });

  test("a second finger during a pull does not zoom the photo", async ({ page }) => {
    await openBench(page, "all");
    await touches(page, [
      [{ type: "pointerdown", id: 61, dx: 0, dy: 0 }],
      ...Array.from({ length: 4 }, (_, step): Touch[] => [
        { type: "pointermove", id: 61, dx: 0, dy: (step + 1) * 8 },
      ]),
      [
        { type: "pointerdown", id: 62, dx: 40, dy: 32 },
        { type: "pointermove", id: 61, dx: 0, dy: 34 },
      ],
      ...Array.from({ length: 5 }, (_, step): Touch[] => [
        { type: "pointermove", id: 61, dx: -(step + 1) * 20, dy: 34 },
        { type: "pointermove", id: 62, dx: 40 + (step + 1) * 20, dy: 32 },
      ]),
    ]);
    await expect(viewer(page)).toHaveAttribute("data-pulling", "true");
    expect(await mediaScale(page)).toBeCloseTo(1, 2);
    await touches(page, [
      [
        { type: "pointerup", id: 62, dx: 140, dy: 32 },
        { type: "pointerup", id: 61, dx: -100, dy: 34 },
      ],
    ]);
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");
  });
});
