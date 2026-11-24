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

/**
 * Two touch pointers spreading apart, one frame per spread (pixels each side of the centre),
 * as the zoom hook sees a pinch. `down` and `up` let one pinch span several calls.
 */
function pinch(
  target: Locator,
  spreads = [20, 35, 50, 65, 80, 95, 110],
  { down = true, up = true } = {},
) {
  return target.evaluate(
    async (node, script) => {
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

      for (const [step, spread] of script.spreads.entries()) {
        const type = step === 0 && script.down ? "pointerdown" : "pointermove";

        send(type, 91, x - spread);
        send(type, 92, x + spread);
        await frame();
      }

      if (!script.up) return;

      const last = script.spreads.at(-1) ?? 0;

      send("pointerup", 91, x - last);
      send("pointerup", 92, x + last);
      await frame();
    },
    { spreads, down, up },
  );
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

  // MAR-22: a pinch while the track still moves waits for it to rest, so a photo is never
  // zoomed between two slides. The smooth scroll stands in for a fling.
  test("a pinch while the track glides waits for it to rest on a slide", async ({ page }) => {
    await openBench(page, "all");
    await page.emulateMedia({ reducedMotion: "no-preference" });

    const track = page.locator("[data-slot=ombra-track]");

    const start = await track.evaluate((node) => {
      node.scrollBy({ left: node.clientWidth * 0.9, behavior: "smooth" });

      return node.scrollLeft;
    });

    await expect.poll(() => track.evaluate((node) => node.scrollLeft)).toBeGreaterThan(start);
    await pinch(track, [20, 40, 60], { up: false });
    expect(await mediaScale(page)).toBeCloseTo(1, 2);

    // The same fingers keep spreading once the next slide rests in the centre.
    await expect
      .poll(() =>
        track.evaluate((node) => {
          const slide = node.querySelector("[data-slot=ombra-slide][data-active=true]");
          const box = slide?.getBoundingClientRect();
          const mid = node.getBoundingClientRect().left + node.clientWidth / 2;

          return box ? Math.abs(box.left + box.width / 2 - mid) : Number.POSITIVE_INFINITY;
        }),
      )
      .toBeLessThan(2);
    await expect(activeSlide(page)).toHaveAttribute("aria-label", second.alt);
    await pinch(
      track,
      Array.from({ length: 12 }, (_, step) => 70 + step * 10),
      { down: false },
    );
    await expect(activeSlide(page).locator("[data-slot=ombra-zoom]")).toHaveAttribute(
      "data-zoomed",
      "true",
    );
  });
});
