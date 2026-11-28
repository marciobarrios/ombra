import { expect, test } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

const photoCount = photos.length;

test.describe("spike navigation", () => {
  for (const input of ["keyboard", "buttons"] as const) {
    test(`${input} arrows slide smoothly without resizing or downgrading photos`, async ({
      page,
      isMobile,
    }) => {
      if (!isMobile) await page.setViewportSize({ width: 1520, height: 1648 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto("/spike?engine=fade");
      await page
        .getByRole("button", { name: "Snowy peaks under the Milky Way", exact: true })
        .click();
      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

      const track = page.locator("[data-slot=ombra-track]");

      await track.evaluate((node) => {
        const scrollTo = node.scrollTo.bind(node);

        Object.defineProperty(node, "scrollTo", {
          value(options: ScrollToOptions) {
            node.dataset.navigationBehavior = options.behavior;
            scrollTo(options);
          },
        });
      });

      await expect
        .poll(() =>
          track
            .locator("img")
            .nth(6)
            .evaluate((image: HTMLImageElement) => image.currentSrc),
        )
        .toContain("07-1600.jpg");

      for (const [from, to] of [
        [6, 7],
        [7, 6],
      ]) {
        const destination = await track.evaluate((node, target) => {
          const slide = node.querySelectorAll("[data-slot=ombra-slide]")[target];
          const rect = slide.getBoundingClientRect();
          const trackRect = node.getBoundingClientRect();

          return (
            node.scrollLeft + rect.left + rect.width / 2 - trackRect.left - trackRect.width / 2
          );
        }, to);

        await track.evaluate(
          (node, indices) => {
            const images = Array.from(node.querySelectorAll<HTMLImageElement>("img"));

            const frames: {
              left: number;
              photos: { width: number; height: number; source: string }[];
            }[] = [];

            const start = performance.now();

            delete node.dataset.navigationFrames;
            delete node.dataset.navigationBehavior;

            const sample = () => {
              frames.push({
                left: node.scrollLeft,
                photos: indices.map((index) => {
                  const image = images[index];
                  const rect = image.getBoundingClientRect();

                  const scale = Math.min(
                    rect.width / image.naturalWidth,
                    rect.height / image.naturalHeight,
                  );

                  return {
                    width: image.naturalWidth * scale,
                    height: image.naturalHeight * scale,
                    source: image.currentSrc,
                  };
                }),
              });

              if (performance.now() - start < 1100) requestAnimationFrame(sample);
              else node.dataset.navigationFrames = JSON.stringify(frames);
            };

            sample();
          },
          [from, to],
        );

        if (input === "keyboard") await page.keyboard.press(to > from ? "ArrowRight" : "ArrowLeft");
        else
          await page
            .getByRole("button", { name: to > from ? "Next photo" : "Previous photo", exact: true })
            .click();

        // Native scroll duration and rAF cadence vary across WebKit platforms.
        // Check the requested behavior and landing position instead of frame count.
        await expect(track).toHaveAttribute("data-navigation-behavior", "smooth");
        await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(
          `${to + 1} / ${photoCount}`,
        );
        await expect(track).toHaveAttribute("data-navigation-frames", /./);

        const frames: {
          left: number;
          photos: { width: number; height: number; source: string }[];
        }[] = JSON.parse((await track.getAttribute("data-navigation-frames"))!);

        const start = frames[0];
        const distance = (await track.evaluate((node) => node.scrollLeft)) - start.left;

        expect(Math.abs(distance)).toBeGreaterThan(100);
        // The recorder measures image stability, not the native scroll duration.
        // A busy runner can still be scrolling when its sampling window ends.
        await expect
          .poll(() =>
            track.evaluate((node, target) => Math.abs(node.scrollLeft - target), destination),
          )
          .toBeLessThan(3);

        for (const [photoIndex, photo] of start.photos.entries()) {
          expect(photo.width).toBeGreaterThan(100);
          expect(photo.height).toBeGreaterThan(100);

          for (const frame of frames) {
            expect(Math.abs(frame.photos[photoIndex].width - photo.width)).toBeLessThan(2);
            expect(Math.abs(frame.photos[photoIndex].height - photo.height)).toBeLessThan(2);

            // An outgoing full-resolution photo must not swap back to its thumbnail.
            if (photoIndex === 0) expect(frame.photos[photoIndex].source).toBe(photo.source);
          }
        }
      }
    });
  }

  test("a resize keeps the active slide centred", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/spike?engine=fade");
    await page
      .getByRole("button", { name: "Snowy peaks under the Milky Way", exact: true })
      .click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const counter = page.locator("[data-slot=ombra-counter]");
    const text = await counter.textContent();
    const track = page.locator("[data-slot=ombra-track]");

    const offCentre = () =>
      track.evaluate((node) => {
        const slide = node.querySelector<HTMLElement>("[data-slot=ombra-slide][data-active=true]");
        const rect = slide!.getBoundingClientRect();
        const trackRect = node.getBoundingClientRect();

        return Math.abs(rect.left + rect.width / 2 - trackRect.left - trackRect.width / 2);
      });

    for (const width of [760, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(offCentre).toBeLessThan(2);
      await expect(counter).toHaveText(text!);
    }
  });

  // MAR-24: only the active photo and its neighbours load in full, and a photo whose files
  // fail shows a fallback in its box without stopping navigation.
  test("loads one neighbour ahead and steps past a failed photo", async ({ page }) => {
    await page.route(/\/photos\/08-/, (route) => route.abort());
    await page.goto("/spike?engine=fade");
    await page.waitForLoadState("networkidle");

    const large: string[] = [];

    page.on("request", (request) => {
      const file = /\/photos\/(\d+)-1600\./.exec(request.url())?.[1];

      if (file) large.push(file);
    });

    await page
      .getByRole("button", { name: "Snowy peaks under the Milky Way", exact: true })
      .click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await expect.poll(() => [...new Set(large)].sort()).toEqual(["06", "07", "08"]);

    const counter = page.locator("[data-slot=ombra-counter]");
    const active = page.locator("[data-slot=ombra-slide][data-active=true]");

    await page.getByRole("button", { name: "Next photo" }).click();
    await expect(counter).toHaveText(`8 / ${photoCount}`);
    await expect(active.locator("[data-slot=ombra-media]")).toHaveAttribute("data-status", "error");
    await expect(active.locator("[data-slot=ombra-media-fallback]")).toBeVisible();

    await page.getByRole("button", { name: "Next photo" }).click();
    await expect(counter).toHaveText(`9 / ${photoCount}`);
    await expect(active.locator("[data-slot=ombra-media]")).toHaveAttribute(
      "data-status",
      "loaded",
    );
    // Never further ahead than one photo past the active one.
    expect(large.every((file) => Number(file) <= 10)).toBe(true);
  });
});
