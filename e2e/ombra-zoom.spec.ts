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

    return rect.width / (node as HTMLElement).offsetWidth;
  });
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

    await pinch(activeMedia(page));
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");
    await expect(zoomOut).toBeEnabled();
    await page.keyboard.press("0");
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");

    await doubleTap(activeMedia(page));
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");
    await expect.poll(() => mediaScale(page)).toBeCloseTo(2.5, 1);
    await page.keyboard.press("0");
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");

    await zoomIn.click();
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");
    await expect.poll(() => mediaScale(page)).toBeCloseTo(1.25, 2);
    await zoomOut.click();
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");
    await expect(zoomOut).toBeDisabled();
  });

  test("slides without OmbraZoom ignore pinch, double-tap, ctrl+wheel and the zoom keys", async ({
    page,
  }) => {
    await openBench(page, "off");

    await expect(page.locator("[data-slot=ombra-zoom]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Acercar" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Alejar" })).toBeDisabled();

    await pinch(activeMedia(page));
    await doubleTap(activeMedia(page));
    await activeMedia(page).dblclick();
    await activeMedia(page).dispatchEvent("wheel", {
      ctrlKey: true,
      deltaY: -200,
      bubbles: true,
      cancelable: true,
    });
    await page.keyboard.press("+");

    await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");
    expect(await mediaScale(page)).toBeCloseTo(1, 2);
    await expect(page.locator("[data-slot=ombra-track]")).not.toHaveCSS("touch-action", "none");
  });

  test("slides without OmbraZoom still swipe to the next photo", async ({
    page,
    context,
    browserName,
  }, testInfo) => {
    await openBench(page, "off");
    await pinch(activeMedia(page));

    const track = page.locator("[data-slot=ombra-track]");
    const box = await track.boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    if (testInfo.project.name.includes("mobile")) {
      test.skip(browserName !== "chromium", "Touch swipes need CDP; mobile WebKit has no wheel");

      const cdp = await context.newCDPSession(page);

      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });

      for (let step = 1; step <= 8; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x - step * 25, y }],
        });
      }

      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await page.mouse.move(x, y);
      await page.mouse.wheel(box.width * 0.6, 0);
    }

    await expect(activeSlide(page)).toHaveAttribute("aria-label", second.alt);
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
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

  test("zoom follows the active slide: on where it is rendered, off where it is not", async ({
    page,
  }) => {
    await openBench(page, "first");

    const zoomIn = page.getByRole("button", { name: "Acercar" });

    await expect(zoomIn).toBeEnabled();
    await doubleTap(activeMedia(page));
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");

    await page.keyboard.press("0");
    await page.keyboard.press("ArrowRight");
    await expect(activeSlide(page)).toHaveAttribute("aria-label", second.alt);
    await expect(zoomIn).toBeDisabled();

    await doubleTap(activeMedia(page));
    await zoomIn.click({ force: true });
    await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");
    expect(await mediaScale(page)).toBeCloseTo(1, 2);

    await page.keyboard.press("ArrowLeft");
    await expect(activeSlide(page)).toHaveAttribute("aria-label", first.alt);
    await expect(zoomIn).toBeEnabled();
  });
});
