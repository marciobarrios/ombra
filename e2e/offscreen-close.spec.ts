import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

async function pageState(page: Page) {
  return page.evaluate(() => ({
    locks: [document.documentElement, document.body].map((element) => ({
      overflow: element.style.overflow,
      position: element.style.position,
      top: element.style.top,
      paddingRight: element.style.paddingRight,
      width: element.style.width,
    })),
    inert: document.querySelectorAll("[inert]").length,
    hiddenTriggers: document.querySelectorAll(
      "[inert] [data-slot=ombra-trigger], [aria-hidden=true] [data-slot=ombra-trigger]",
    ).length,
    namedImages: Array.from(document.images).filter(
      (image) => getComputedStyle(image).viewTransitionName === "ombra-shared",
    ).length,
  }));
}

const configurations = [
  { engine: "vt", reducedMotion: "no-preference" },
  { engine: "flip", reducedMotion: "no-preference" },
  { engine: "fade", reducedMotion: "no-preference" },
  { engine: "vt", reducedMotion: "reduce" },
] as const;

for (const { engine, reducedMotion } of configurations) {
  for (const slow of [false, true]) {
    for (const direction of ["above", "below"] as const) {
      test(`${engine}, ${reducedMotion}, ${slow ? "slow" : "normal"}: closes to a target ${direction} the viewport`, async ({
        page,
        browserName,
        isMobile,
      }) => {
        await page.setViewportSize({ width: 390, height: 480 });
        await page.emulateMedia({ reducedMotion });
        await page.goto(`/spike?engine=${engine}&slow=${slow ? 1 : 0}`);

        const initialState = await pageState(page);
        const triggers = page.locator("[data-slot=ombra-trigger]");
        const targetIndex = direction === "above" ? 0 : photos.length - 1;
        const origin = direction === "above" ? triggers.last() : triggers.first();
        const target = triggers.nth(targetIndex);
        const viewer = page.locator("[data-slot=ombra-viewer]");

        await origin.click();
        await expect(viewer).toHaveAttribute("data-phase", "open");
        await expect(viewer).toHaveAttribute(
          "data-engine",
          reducedMotion === "reduce" ? "fade" : engine,
        );
        await page.keyboard.press(direction === "above" ? "Home" : "End");
        await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(
          `${targetIndex + 1} / ${photos.length}`,
        );

        // Prove this takes the off-screen branch before Close can reveal the target.
        await expect
          .poll(() =>
            target.evaluate((element, side) => {
              const rect = element.getBoundingClientRect();

              return side === "above" ? rect.bottom <= 0 : rect.top >= window.innerHeight;
            }, direction),
          )
          .toBe(true);

        await page.getByRole("button", { name: "Close", exact: true }).click();
        await expect(viewer).toHaveCount(0, { timeout: 8_000 });
        await expect(page.locator("[data-slot=ombra-backdrop]")).toHaveCount(0);
        await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);
        await expect(target).toBeFocused();
        await expect(target).toBeInViewport({ ratio: 0.55 });
        await expect.poll(() => pageState(page)).toEqual(initialState);

        const beforeScroll = await page.evaluate(() => window.scrollY);
        const scrollDelta = direction === "above" ? 300 : -300;

        if (browserName === "webkit" && isMobile) {
          // Playwright cannot send wheel input to mobile WebKit; style checks above
          // cover scroll-lock cleanup, and this checks that the page can move again.
          await page.evaluate((delta) => window.scrollBy(0, delta), scrollDelta);
        } else {
          await page.mouse.move(200, 240);
          await page.mouse.wheel(0, scrollDelta);
        }

        await expect
          .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - beforeScroll))
          .toBeGreaterThan(40);
        await target.click();
        await expect(viewer).toHaveAttribute("data-phase", "open");
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await expect(viewer).toHaveCount(0, { timeout: 8_000 });
        await expect(target).toBeFocused();
        await expect.poll(() => pageState(page)).toEqual(initialState);
      });
    }
  }
}
