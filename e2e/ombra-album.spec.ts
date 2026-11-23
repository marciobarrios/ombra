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
});
