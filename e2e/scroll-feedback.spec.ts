import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

const photoCount = photos.length;

async function openViewer(page: Page, query = "scroll=both&engine=fade") {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/spike?${query}`);
  await page.locator('[data-slot="ombra-trigger"]').first().click();
  await expect(page.locator('[data-slot="ombra-viewer"]')).toHaveAttribute("data-phase", "open");
}

async function feedback(page: Page) {
  return page.evaluate(() => {
    const footer = document.querySelector('[data-slot="ombra-viewer"] footer');
    const strip = document.querySelector('[data-slot="ombra-thumbnails"]');
    const start = document.querySelector('[data-slot="ombra-strip-edge-start"]');
    const end = document.querySelector('[data-slot="ombra-strip-edge-end"]');
    const thumbnails = document.querySelectorAll('[data-slot="ombra-thumbnail"]');

    if (!(footer instanceof HTMLElement) || !(strip instanceof HTMLElement) || !start || !end) {
      throw new Error("Missing thumbnail strip");
    }

    return {
      left: Number(getComputedStyle(start).opacity),
      right: Number(getComputedStyle(end).opacity),
      cue: getComputedStyle(start).display,
      overflowing: strip.dataset.overflowing,
      opacities: Array.from(thumbnails, (thumbnail) => {
        const image = thumbnail.querySelector("img");

        if (!image) throw new Error("Missing thumbnail image");

        return (
          Number(getComputedStyle(image).opacity) * Number(getComputedStyle(thumbnail).opacity)
        );
      }),
    };
  });
}

async function hasTimelines(page: Page) {
  return page.evaluate(() => CSS.supports("animation-timeline: view(inline)"));
}

async function positionSlide(page: Page, index: number, fraction = 0) {
  await page.locator('[data-slot="ombra-track"]').evaluate(
    (track, position) => {
      const slides = track.querySelectorAll('[data-slot="ombra-slide"]');
      const slide = slides[position.index];
      const next = slides[position.index + 1];

      if (!(track instanceof HTMLElement) || !(slide instanceof HTMLElement)) {
        throw new Error("Missing gallery slide");
      }

      const rect = slide.getBoundingClientRect();
      const trackRect = track.getBoundingClientRect();
      const step = next ? next.getBoundingClientRect().left - rect.left : 0;

      // Hold an actual fractional scroll offset so CSS can be measured before snapping settles.
      track.style.scrollSnapType = "none";
      track.scrollLeft +=
        rect.left +
        rect.width / 2 -
        (trackRect.left + trackRect.width / 2) +
        step * position.fraction;
    },
    { index, fraction },
  );
}

test("scroll feedback modes round-trip through the URL", async ({ page }) => {
  await page.goto("/spike?engine=flip&spring=1&slow=1&scroll=invalid");
  await expect(page.getByRole("radio", { name: "Off", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Both", exact: true }).check();
  await expect(page).toHaveURL(/scroll=both/);
  await page.reload();
  await expect(page.getByRole("radio", { name: "Both", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Off", exact: true }).check();
  await expect.poll(() => new URL(page.url()).searchParams.has("scroll")).toBe(false);
  expect(new URL(page.url()).searchParams.get("spring")).toBe("1");
  expect(new URL(page.url()).searchParams.get("slow")).toBe("1");
  expect(new URL(page.url()).searchParams.get("engine")).toBe("flip");
});

test("edge cues follow strip overflow and disappear when it fits", async ({ page }) => {
  await openViewer(page, "scroll=edges&engine=fade");
  test.skip(!(await hasTimelines(page)), "This browser exercises the static fallback instead.");
  await expect.poll(async () => (await feedback(page)).overflowing).toBe("true");
  await expect.poll(async () => (await feedback(page)).left).toBeLessThan(0.01);
  await expect.poll(async () => (await feedback(page)).right).toBeGreaterThan(0.99);
  await expect.poll(async () => (await feedback(page)).opacities[1]).toBeCloseTo(0.6);

  await page.locator('[data-slot="ombra-thumbnails"]').evaluate((strip) => {
    strip.scrollLeft = strip.scrollWidth / 2;
  });
  await expect.poll(async () => (await feedback(page)).left).toBeGreaterThan(0.99);
  await expect.poll(async () => (await feedback(page)).right).toBeGreaterThan(0.99);

  await page.locator('[data-slot="ombra-thumbnails"]').evaluate((strip) => {
    strip.scrollLeft = strip.scrollWidth;
  });
  await expect.poll(async () => (await feedback(page)).right).toBeLessThan(0.01);
  await expect(page.locator('[data-slot="ombra-counter"]')).toHaveText(`1 / ${photoCount}`);

  await page.setViewportSize({ width: Math.max(1280, photoCount * 52 + 64), height: 900 });
  await expect.poll(async () => (await feedback(page)).overflowing).toBe("false");
  await expect.poll(async () => (await feedback(page)).cue).toBe("none");
});

test("thumbnail emphasis follows gallery progress independently of strip browsing", async ({
  page,
}) => {
  await openViewer(page, "scroll=emphasis&engine=fade");
  test.skip(!(await hasTimelines(page)), "This browser exercises the static fallback instead.");
  await expect.poll(async () => (await feedback(page)).opacities[0]).toBeGreaterThan(0.99);
  await expect.poll(async () => (await feedback(page)).opacities[1]).toBeCloseTo(0.6);
  expect((await feedback(page)).cue).toBe("none");

  await page.locator('[data-slot="ombra-thumbnails"]').evaluate((strip) => {
    strip.scrollLeft = strip.scrollWidth;
  });
  await expect.poll(async () => (await feedback(page)).opacities[0]).toBeGreaterThan(0.99);
  await expect(page.locator('[data-slot="ombra-counter"]')).toHaveText(`1 / ${photoCount}`);

  await positionSlide(page, 0, 0.5);
  await expect.poll(async () => (await feedback(page)).opacities[0]).toBeLessThan(0.9);
  await expect.poll(async () => (await feedback(page)).opacities[1]).toBeGreaterThan(0.65);
  await positionSlide(page, 6);
  await expect.poll(async () => (await feedback(page)).opacities[6]).toBeGreaterThan(0.99);
  await expect(page.locator('[data-slot="ombra-counter"]')).toHaveText(`7 / ${photoCount}`);
  await positionSlide(page, photoCount - 1);
  await expect
    .poll(async () => (await feedback(page)).opacities[photoCount - 1])
    .toBeGreaterThan(0.99);
  await expect(page.locator('[data-slot="ombra-thumbnail"]').last()).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("reduced motion and an unsupported CSS gate preserve the original appearance", async ({
  page,
}) => {
  await openViewer(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(async () => (await feedback(page)).cue).toBe("none");
  await expect.poll(async () => (await feedback(page)).opacities[0]).toBe(1);
  await expect.poll(async () => (await feedback(page)).opacities[1]).toBeCloseTo(0.6);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  if (await hasTimelines(page)) {
    await expect.poll(async () => (await feedback(page)).cue).toBe("block");
  } else {
    await expect.poll(async () => (await feedback(page)).cue).toBe("none");
    await expect.poll(async () => (await feedback(page)).opacities[1]).toBeCloseTo(0.6);
  }

  // Force the stylesheet's unsupported branch without pretending CSS.supports mocks affect CSS.
  await page.locator('[data-slot="spike-scroll-feedback"]').evaluate((style) => {
    style.textContent =
      style.textContent?.replace(/@supports[^{]+\{/, "@supports (ombra-unsupported: true) {") ?? "";
  });
  await expect.poll(async () => (await feedback(page)).cue).toBe("none");
  await expect.poll(async () => (await feedback(page)).opacities[1]).toBeCloseTo(0.6);
  await page.keyboard.press("End");
  await expect(page.locator('[data-slot="ombra-counter"]')).toHaveText(
    `${photoCount} / ${photoCount}`,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="ombra-trigger"]').last()).toBeFocused();
});

for (const engine of ["fade", "flip", "vt"]) {
  test(`both effects preserve navigation, zoom, and focus with ${engine}`, async ({ page }) => {
    await openViewer(page, `scroll=both&engine=${engine}`);
    await page.locator('[data-slot="ombra-thumbnail"]').nth(5).click();
    await expect(page.locator('[data-slot="ombra-counter"]')).toHaveText(`6 / ${photoCount}`);
    await expect.poll(async () => (await feedback(page)).opacities[5]).toBeGreaterThan(0.99);
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

test("VT falls back for an off-screen close even with feedback off", async ({ page }) => {
  await openViewer(page, "scroll=off&engine=vt");
  await page.locator('[data-slot="ombra-thumbnail"]').nth(5).click();
  await expect(page.locator('[data-slot="ombra-counter"]')).toHaveText(`6 / ${photoCount}`);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="ombra-viewer"]')).toBeHidden();
  await expect(page.locator('[data-slot="ombra-trigger"]').nth(5)).toBeFocused();
});

test("VT falls back when the browser has no View Transition API", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Document.prototype, "startViewTransition");
  });
  await openViewer(page, "scroll=both&engine=vt");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="ombra-viewer"]')).toBeHidden();
  await expect(page.locator('[data-slot="ombra-trigger"]').first()).toBeFocused();
});

test("both effects preserve pull-to-dismiss", async ({ page }) => {
  await openViewer(page, "scroll=both&engine=flip");

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
