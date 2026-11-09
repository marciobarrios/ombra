import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

const photoCount = photos.length;

async function openViewer(page: Page, engine = "fade") {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/spike?engine=${engine}`);
  await page.locator('[data-slot="ombra-trigger"]').first().click();
  await expect(page.locator('[data-slot="ombra-viewer"]')).toHaveAttribute("data-phase", "open");
}

async function cues(page: Page) {
  return page.evaluate(() => {
    const strip = document.querySelector('[data-slot="ombra-thumbnails"]');
    const start = document.querySelector('[data-slot="ombra-strip-edge-start"]');
    const end = document.querySelector('[data-slot="ombra-strip-edge-end"]');
    const thumbnails = document.querySelectorAll('[data-slot="ombra-thumbnail"]');

    if (!(strip instanceof HTMLElement) || !start || !end) {
      throw new Error("Missing thumbnail strip");
    }

    return {
      left: Number(getComputedStyle(start).opacity),
      right: Number(getComputedStyle(end).opacity),
      display: getComputedStyle(start).display,
      overflowing: strip.dataset.overflowing,
      opacities: Array.from(thumbnails, (thumbnail) => Number(getComputedStyle(thumbnail).opacity)),
    };
  });
}

async function hasTimelines(page: Page) {
  return page.evaluate(() => CSS.supports("animation-timeline: scroll(inline)"));
}

test("the page has no scroll feedback controls and ignores the old query", async ({ page }) => {
  await page.goto("/spike?engine=flip&scroll=both");
  await expect(page.getByRole("radio", { name: "Thumbnail emphasis" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Edge cues" })).toHaveCount(0);
});

test("edge cues follow strip overflow and disappear when it fits", async ({ page }) => {
  await openViewer(page);
  test.skip(!(await hasTimelines(page)), "This browser exercises the static fallback instead.");
  await expect.poll(async () => (await cues(page)).overflowing).toBe("true");
  await expect.poll(async () => (await cues(page)).left).toBeLessThan(0.01);
  await expect.poll(async () => (await cues(page)).right).toBeGreaterThan(0.99);
  await expect.poll(async () => (await cues(page)).opacities[1]).toBeCloseTo(0.6);

  await page.locator('[data-slot="ombra-thumbnails"]').evaluate((strip) => {
    strip.scrollLeft = strip.scrollWidth / 2;
  });
  await expect.poll(async () => (await cues(page)).left).toBeGreaterThan(0.99);
  await expect.poll(async () => (await cues(page)).right).toBeGreaterThan(0.99);

  await page.locator('[data-slot="ombra-thumbnails"]').evaluate((strip) => {
    strip.scrollLeft = strip.scrollWidth;
  });
  await expect.poll(async () => (await cues(page)).right).toBeLessThan(0.01);
  await expect(page.locator('[data-slot="ombra-counter"]')).toHaveText(`1 / ${photoCount}`);

  await page.setViewportSize({ width: Math.max(1280, photoCount * 52 + 64), height: 900 });
  await expect.poll(async () => (await cues(page)).overflowing).toBe("false");
  await expect.poll(async () => (await cues(page)).display).toBe("none");
});

test("reduced motion and an unsupported CSS gate preserve the static appearance", async ({
  page,
}) => {
  await openViewer(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(async () => (await cues(page)).display).toBe("none");
  await expect.poll(async () => (await cues(page)).opacities[0]).toBe(1);
  await expect.poll(async () => (await cues(page)).opacities[1]).toBeCloseTo(0.6);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  if (await hasTimelines(page)) {
    await expect.poll(async () => (await cues(page)).display).toBe("block");
  } else {
    await expect.poll(async () => (await cues(page)).display).toBe("none");
    await expect.poll(async () => (await cues(page)).opacities[1]).toBeCloseTo(0.6);
  }

  // Force the stylesheet's unsupported branch without pretending CSS.supports mocks affect CSS.
  await page.locator('[data-slot="ombra-strip-edge-styles"]').evaluate((style) => {
    style.textContent =
      style.textContent?.replace(/@supports[^{]+\{/, "@supports (ombra-unsupported: true) {") ?? "";
  });
  await expect.poll(async () => (await cues(page)).display).toBe("none");
  await expect.poll(async () => (await cues(page)).opacities[1]).toBeCloseTo(0.6);
  await page.keyboard.press("End");
  await expect(page.locator('[data-slot="ombra-counter"]')).toHaveText(
    `${photoCount} / ${photoCount}`,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="ombra-trigger"]').last()).toBeFocused();
});

for (const engine of ["fade", "flip", "vt"]) {
  test(`edge cues preserve navigation, zoom, and focus with ${engine}`, async ({ page }) => {
    await openViewer(page, engine);
    await page.locator('[data-slot="ombra-thumbnail"]').nth(5).click();
    await expect(page.locator('[data-slot="ombra-counter"]')).toHaveText(`6 / ${photoCount}`);
    await expect.poll(async () => (await cues(page)).opacities[5]).toBeGreaterThan(0.99);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(page.locator('[data-slot="ombra-viewer"]')).toHaveAttribute("data-zoomed", "true");
    await page.keyboard.press("0");
    await expect(page.locator('[data-slot="ombra-viewer"]')).toHaveAttribute(
      "data-zoomed",
      "false",
    );
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="ombra-viewer"]')).toBeHidden();
    await expect(page.locator('[data-slot="ombra-trigger"]').nth(5)).toBeFocused();
  });
}

test("VT falls back when the browser has no View Transition API", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Document.prototype, "startViewTransition");
  });
  await openViewer(page, "vt");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="ombra-viewer"]')).toBeHidden();
  await expect(page.locator('[data-slot="ombra-trigger"]').first()).toBeFocused();
});

test("edge cues preserve pull-to-dismiss", async ({ page }) => {
  await openViewer(page, "flip");

  const bounds = await page.locator('[data-slot="ombra-track"]').boundingBox();

  if (!bounds) throw new Error("Missing track bounds");

  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 3;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 160, { steps: 12 });
  await expect(page.locator('[data-slot="ombra-viewer"]')).toHaveAttribute("data-pulling", "true");
  await page.mouse.up();
  await expect(page.locator('[data-slot="ombra-viewer"]')).toBeHidden();
  await expect(page.locator('[data-slot="ombra-trigger"]').first()).toBeFocused();
});
