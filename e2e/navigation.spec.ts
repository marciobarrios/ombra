import { expect, test } from "@playwright/test";

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
        await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(`${to + 1} / 12`);
        await expect(track).toHaveAttribute("data-navigation-frames", /./);

        const frames: {
          left: number;
          photos: { width: number; height: number; source: string }[];
        }[] = JSON.parse((await track.getAttribute("data-navigation-frames"))!);

        const start = frames[0];
        const end = frames.at(-1)!;
        const distance = end.left - start.left;

        expect(Math.abs(distance)).toBeGreaterThan(100);
        expect(Math.abs(end.left - destination)).toBeLessThan(3);

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

  test("retargets rapid arrow presses and reverses before the next slide is selected", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=fade");
    await page
      .getByRole("button", { name: "Snowy peaks under the Milky Way", exact: true })
      .click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const track = page.locator("[data-slot=ombra-track]");
    const start = await track.evaluate((node) => node.scrollLeft);

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(() => track.evaluate((node, origin) => Math.abs(node.scrollLeft - origin), start))
      .toBeLessThan(3);
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText("7 / 12");

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText("9 / 12");
    await expect
      .poll(() =>
        track.evaluate((node) => {
          const slide = node.querySelectorAll("[data-slot=ombra-slide]")[8];
          const rect = slide.getBoundingClientRect();
          const trackRect = node.getBoundingClientRect();

          return Math.abs(rect.left + rect.width / 2 - trackRect.left - trackRect.width / 2);
        }),
      )
      .toBeLessThan(2);
  });
});
