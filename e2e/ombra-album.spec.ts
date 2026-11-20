import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

// MAR-143: the album recipe composes the gallery's public parts differently, in JSX only. One
// cover opens the album, the controls sit in its header, photos render through `<picture>`,
// and it has no thumbnail strip and no zoom.

const album = photos.slice(0, 5);
const [first, second, third] = album;

if (!first || !second || !third) throw new Error("The bench needs three photos.");

const viewer = (page: Page) => page.locator("[data-slot=ombra-album]");
const header = (page: Page) => page.locator("[data-slot=ombra-album-header]");
const cover = (page: Page) => page.locator("[data-slot=ombra-trigger]");
const activeSlide = (page: Page) => page.locator("[data-slot=ombra-slide][data-active=true]");

async function hydrated(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const trigger = document.querySelector("[data-slot=ombra-trigger]");

        return trigger ? Object.keys(trigger).some((key) => key.startsWith("__reactProps")) : false;
      }),
    )
    .toBe(true);
}

async function openAlbum(page: Page) {
  await page.goto("/spike/album");
  await hydrated(page);
  await cover(page).click();
  await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
}

test.describe("album recipe", () => {
  test("one cover opens the whole album with a FLIP morph", async ({ page }) => {
    await page.goto("/spike/album");
    await hydrated(page);
    await expect(cover(page)).toHaveCount(1);

    await cover(page).click();
    await expect(viewer(page)).toHaveAttribute("data-engine", "flip");
    await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
    await expect(page.getByRole("dialog", { name: "Coast and city" })).toBeVisible();
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(`1 of ${album.length}`);
    await expect(page.locator("[data-slot=ombra-slide]")).toHaveCount(album.length);
    await expect(activeSlide(page)).toHaveAttribute("aria-label", first.alt);
  });

  test("moved controls: previous, next and close work from the header", async ({ page }) => {
    await openAlbum(page);

    for (const slot of ["ombra-previous", "ombra-next", "ombra-close", "ombra-counter"]) {
      await expect(header(page).locator(`[data-slot=${slot}]`)).toHaveCount(1);
    }

    await expect(page.locator("[data-slot=ombra-thumbnails]")).toHaveCount(0);
    await expect(header(page).getByRole("button", { name: "Previous photo" })).toBeDisabled();

    await header(page).getByRole("button", { name: "Next photo" }).click();
    await expect(activeSlide(page)).toHaveAttribute("aria-label", second.alt);
    await header(page).getByRole("button", { name: "Next photo" }).click();
    await expect(activeSlide(page)).toHaveAttribute("aria-label", third.alt);
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(`3 of ${album.length}`);

    // The third photo has no trigger of its own: the close fades and focus returns to the cover.
    await header(page).getByRole("button", { name: "Close album" }).click();
    await expect(viewer(page)).toHaveCount(0);
    await expect(cover(page)).toBeFocused();
  });

  test("another image renderer: the morph lands on a picture's image", async ({ page }) => {
    await openAlbum(page);

    const media = activeSlide(page).locator("[data-slot=ombra-media]");

    await expect(media.locator("picture > source[type]")).toHaveCount(1);

    const fit = await media.evaluate((node) => {
      const image = node.querySelector("picture > img");

      if (!(image instanceof HTMLImageElement)) throw new Error("No picture image.");

      const box = node.getBoundingClientRect();
      const shown = image.getBoundingClientRect();

      return {
        complete: image.complete && image.naturalWidth > 0,
        dx: Math.abs(box.x - shown.x) + Math.abs(box.width - shown.width),
        dy: Math.abs(box.y - shown.y) + Math.abs(box.height - shown.height),
        ratio: box.width / box.height,
      };
    });

    expect(fit.complete).toBe(true);
    expect(fit.dx).toBeLessThan(1);
    expect(fit.dy).toBeLessThan(1);
    expect(fit.ratio).toBeCloseTo(first.width / first.height, 2);
    // The FLIP clone is gone once the photo under it has decoded.
    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);
  });

  test("no OmbraZoom: zoom keys and ctrl+wheel leave the photo at its fitted size", async ({
    page,
  }) => {
    await openAlbum(page);

    await expect(page.locator("[data-slot=ombra-zoom]")).toHaveCount(0);
    await expect(page.locator("[data-slot=ombra-zoom-in]")).toHaveCount(0);

    const media = activeSlide(page).locator("[data-slot=ombra-media]");
    const before = await media.boundingBox();

    await page.keyboard.press("+");
    // Mobile WebKit has no mouse wheel, so the ctrl+wheel arrives as a dispatched event.
    await media.dispatchEvent("wheel", {
      ctrlKey: true,
      deltaY: -400,
      bubbles: true,
      cancelable: true,
    });
    await media.dblclick();

    await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");
    expect(
      await viewer(page).evaluate((node) =>
        Number(getComputedStyle(node).getPropertyValue("--ombra-zoom")),
      ),
    ).toBe(1);
    expect(await media.boundingBox()).toEqual(before);
    await expect(activeSlide(page)).toHaveAttribute("aria-label", first.alt);
  });
});
