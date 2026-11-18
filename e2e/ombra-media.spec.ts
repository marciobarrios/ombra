import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

// MAR-140: OmbraMedia registers the box a morph lands on, whatever renders the image.
// The /spike/media bench puts a Next.js Image inside it, with a caption in the slide.

type Rect = { x: number; y: number; width: number; height: number };

/** Where a flight finished, and the boxes it should have landed on at that moment. */
type Landing = { flight: Rect; media: Rect | null; thumb: Rect | null };

declare global {
  interface Window {
    mediaLandings?: Landing[];
  }
}

const items = photos.slice(0, 4);
const second = items[1];

if (!second) throw new Error("The bench needs a second photo.");

/** Records each flight's box when its animation finishes, before the viewer removes it. */
function recordLandings() {
  const landings: Landing[] = [];
  const animate = Element.prototype.animate;

  const box = (element: Element | null): Rect | null => {
    if (!element) return null;

    const rect = element.getBoundingClientRect();

    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };

  window.mediaLandings = landings;

  Element.prototype.animate = function (this: Element, ...args) {
    const animation = animate.apply(this, args);

    if (this.matches("[data-slot=ombra-flight]")) {
      void animation.finished.then(
        () => {
          const flight = box(this);

          if (!this.isConnected || !flight) return;

          landings.push({
            flight,
            media: box(
              document.querySelector(
                "[data-slot=ombra-slide][data-active=true] [data-slot=ombra-media]",
              ),
            ),
            thumb: box(document.querySelectorAll("[data-slot=ombra-trigger] img")[1] ?? null),
          });
        },
        () => undefined,
      );
    }

    return animation;
  };
}

function expectSameBox(actual: Rect | null | undefined, expected: Rect | null | undefined) {
  expect(actual).toBeTruthy();
  expect(expected).toBeTruthy();

  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs((actual?.[key] ?? 0) - (expected?.[key] ?? 0))).toBeLessThan(1);
  }
}

function sameBox(a: Rect | null, b: Rect | null) {
  return (
    a !== null &&
    b !== null &&
    (["x", "y", "width", "height"] as const).every((key) => Math.abs(a[key] - b[key]) < 1)
  );
}

const viewer = (page: Page) => page.locator("[data-slot=ombra-viewer]");

async function landings(page: Page): Promise<Landing[]> {
  return page.evaluate(() => window.mediaLandings ?? []);
}

test.describe("OmbraMedia around a Next.js Image", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(recordLandings);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike/media");
    // A click before hydration does nothing.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const trigger = document.querySelector("[data-slot=ombra-trigger]");

          return trigger
            ? Object.keys(trigger).some((key) => key.startsWith("__reactProps"))
            : false;
        }),
      )
      .toBe(true);
  });

  test("the open and close morph land on the Next.js Image", async ({ page }) => {
    await page.getByRole("button", { name: second.alt, exact: true }).click();
    await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);

    const media = page.locator("[data-slot=ombra-slide][data-active=true] [data-slot=ombra-media]");
    // Next.js marks the images it renders, and serves them through its optimiser.
    const image = media.locator("img[data-nimg]");

    await expect(image).toHaveAttribute("srcset", /\/_next\/image/);
    await expect(media).toHaveCSS("visibility", "visible");

    // The media is the image's own box, at its intrinsic ratio. The bench caps it at 70% of
    // its frame, so it is not the box a plain fit would give.
    const mediaBox = await media.boundingBox();
    const imageBox = await image.boundingBox();
    const frameBox = await media.locator("..").boundingBox();

    expectSameBox(imageBox, mediaBox);
    expect(mediaBox?.width ?? 0).toBeLessThan((frameBox?.width ?? 0) * 0.71);
    expect((mediaBox?.width ?? 0) / (mediaBox?.height ?? 1)).toBeCloseTo(
      second.width / second.height,
      2,
    );

    // A flight runs its transform and its corner radius as two animations; both land.
    const [opening] = await landings(page);

    expectSameBox(opening?.flight, opening?.media);
    expectSameBox(opening?.media, mediaBox);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);

    const all = await landings(page);
    const closing = all.at(-1);

    // The open's landings, then the close's, and nothing in between.
    expect(all.length).toBeGreaterThan(1);
    expect(all.filter((landing) => sameBox(landing.flight, landing.media)).length).toBe(
      all.length / 2,
    );
    expectSameBox(closing?.flight, closing?.thumb);
    await expect(page.getByRole("button", { name: second.alt, exact: true })).toBeFocused();
  });

  test("a caption inside the slide needs no prop and sits beside the photo", async ({ page }) => {
    await page.getByRole("button", { name: second.alt, exact: true }).click();
    await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 10_000 });

    const slide = page.locator("[data-slot=ombra-slide][data-active=true]");
    const caption = slide.getByTestId("caption");

    await expect(caption).toHaveText(second.caption);
    await expect(caption).toBeVisible();

    const mediaBox = await slide.locator("[data-slot=ombra-media]").boundingBox();
    const captionBox = await caption.boundingBox();

    // The photo fits the space the caption leaves, so they never overlap.
    expect((mediaBox?.y ?? 0) + (mediaBox?.height ?? 0)).toBeLessThanOrEqual(
      (captionBox?.y ?? 0) + 0.5,
    );
  });

  test("a swipe during the opening shows the decoded thumbnail until the Image loads", async ({
    page,
  }) => {
    // Hold every optimised image back, so the hand-off finds the Image still loading.
    let release: () => void = () => undefined;

    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route(/\/_next\/image/, async (route) => {
      await held;
      await route.continue();
    });

    await page.getByRole("button", { name: second.alt, exact: true }).click();
    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(1);

    // A small programmatic scroll stands in for a finger: the track moving ends the clone.
    await page.evaluate(() => {
      const track = document.querySelector<HTMLElement>("[data-slot=ombra-track]");

      if (!track) throw new Error("viewer is not mounted");

      track.style.scrollSnapType = "none";
      track.scrollLeft += 12;
    });
    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);

    const image = page.locator(
      "[data-slot=ombra-slide][data-active=true] [data-slot=ombra-media] img",
    );

    // The thumbnail the morph flew with paints in its place, not a blank box.
    await expect
      .poll(() =>
        image.evaluate((node) => {
          // SAFETY: the locator matches an <img> inside the media.
          const img = node as HTMLImageElement;

          return img.complete && img.naturalWidth > 0 && !img.hasAttribute("srcset");
        }),
      )
      .toBe(true);

    release();

    // Once the browser's own choice has decoded, the Image gets its sources back.
    await expect(image).toHaveAttribute("srcset", /\/_next\/image/, { timeout: 10_000 });
    await expect(image).toHaveAttribute("src", /\/_next\/image/);
  });
});
