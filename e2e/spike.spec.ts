import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

declare global {
  interface Window {
    ombraWheelSeen?: { prevented: number; events: number; pull: number };
    ombraWheelLog?: { t: number; prevented: boolean; viewer: boolean }[];
    ombraFirstFlight?: Promise<number>;
    ombraWheelCatch?: { before: number; after: number }[];
    ombraStreamGap?: number;
    ombraPullSeen?: { pulled: boolean; peak: number };
  }
}

const photoCount = photos.length;

const firstPhoto = "Desert road through red rock toward a distant peak";

test.describe("spike viewer", () => {
  test("opens, moves with the keyboard, and returns focus", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=fade");

    const trigger = page.getByRole("button", { name: firstPhoto });

    await trigger.click();

    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(`1 / ${photoCount}`);
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("status")).toContainText(`2 of ${photoCount}`);
    await page.keyboard.press("Home");
    await expect(page.getByRole("status")).toContainText(`1 of ${photoCount}`);
    await page.keyboard.press("End");
    await expect(page.getByRole("status")).toContainText(`${photoCount} of ${photoCount}`);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator("[data-slot=ombra-trigger]").last()).toBeFocused();
  });

  test("renders the experiment controls outside the registry gallery", async ({ page }) => {
    await page.goto("/spike?engine=flip");

    const gallery = page.locator("[data-slot=ombra-root]");

    await expect(page.locator("[data-slot=ombra-engine]")).toBeVisible();
    await expect(page.locator("[data-slot=ombra-readout]")).toBeVisible();
    await expect(page.locator("[data-slot=ombra-spring]")).toBeVisible();
    await expect(page.locator("[data-slot=ombra-slow]")).toBeVisible();
    await expect(
      gallery.locator(
        "[data-slot=ombra-engine], [data-slot=ombra-readout], [data-slot=ombra-spring], [data-slot=ombra-slow]",
      ),
    ).toHaveCount(0);
  });

  test("starts the readout over when spring or slow motion changes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=fade");

    const open = page.locator("[data-slot=ombra-readout-open]");

    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(open).toHaveText(/^Open \d+\.\d ms/);
    await page.getByRole("button", { name: "Spring" }).click();
    await expect(open).toHaveText("Open –");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(open).toHaveText(/^Open \d+\.\d ms/);
    await page.getByRole("button", { name: "Slow motion" }).click();
    await expect(open).toHaveText("Open –");
  });

  test("keeps separate frame readouts for the last open and close", async ({ page }) => {
    // Slow motion gives the close enough frames for a readout where rAF runs slowly (CI WebKit).
    await page.goto("/spike?engine=flip&slow=1");

    const open = page.locator("[data-slot=ombra-readout-open]");
    const close = page.locator("[data-slot=ombra-readout-close]");

    await expect(open).toHaveText("Open –");
    await expect(close).toHaveText("Close –");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await expect(open).toHaveText(/^Open \d+\.\d ms \/ \d+ @ \d+\.\d ms$/);
    await expect(close).toHaveText("Close –");

    const opened = await open.textContent();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(close).toHaveText(/^Close \d+\.\d ms \/ \d+ @ \d+\.\d ms$/);
    await expect(open).toHaveText(opened ?? "");
  });

  test("says where a run dropped frames", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1");
    await page.locator("[data-slot=ombra-trigger]").first().waitFor();
    // Stall the main thread a few frames into the open, so the drop lands mid-flight every time.
    await page.evaluate(() => {
      document.querySelector<HTMLElement>("[data-slot=ombra-trigger]")?.click();

      let frames = 0;

      const stall = () => {
        frames += 1;

        if (frames < 5) {
          requestAnimationFrame(stall);

          return;
        }

        const until = performance.now() + 200;

        while (performance.now() < until) {
          // Busy-wait: nothing else may run.
        }
      };

      requestAnimationFrame(stall);
    });
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open", {
      timeout: 8_000,
    });
    await expect(page.locator("[data-slot=ombra-readout-open-drops]")).toHaveText(
      /^drops at \d+(, \d+)* of \d+$/,
    );
  });

  test("tallies clean runs until the engine changes", async ({ page }) => {
    // Slow motion gives the close enough frames for a sample where rAF runs slowly (CI WebKit).
    await page.goto("/spike?engine=flip&slow=1");

    const open = page.locator("[data-slot=ombra-readout-open]");
    const close = page.locator("[data-slot=ombra-readout-close]");
    const openTally = page.locator("[data-slot=ombra-readout-open-tally]");
    const closeTally = page.locator("[data-slot=ombra-readout-close-tally]");
    const viewer = page.locator("[data-slot=ombra-viewer]");

    for (let run = 1; run <= 2; run += 1) {
      await page.getByRole("button", { name: firstPhoto }).click();
      await expect(viewer).toHaveAttribute("data-phase", "open");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      const tally = new RegExp(`^clean [0-${run}]/${run} · mid [0-${run}]/${run}`);

      await expect(openTally).toHaveText(tally);
      await expect(closeTally).toHaveText(tally);
    }

    await page.getByRole("radio", { name: "Fade" }).check();
    await expect(open).toHaveText("Open –");
    await expect(close).toHaveText("Close –");
    await expect(openTally).toHaveCount(0);
  });

  test("benchmarks every engine without a finger", async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?bench=1&runs=2");
    await page.getByRole("button", { name: "Run 2× per engine" }).click();
    await expect(page.locator("[data-slot=spike-bench-status]")).toHaveText("done", {
      timeout: 80_000,
    });

    for (const engine of ["flip", "vt", "fade"]) {
      const cells = page.locator(`[data-slot=spike-bench-row][data-engine=${engine}] td`);

      await expect(cells).toHaveCount(8);
      await expect(cells.nth(1)).toHaveText(/^[0-2]\/2$/);
      await expect(cells.nth(3)).toHaveText(/^[0-2]\/2$/);
      await expect(cells.nth(5)).toHaveText(/^\d+\.\d ms$/);
    }
  });

  test("reports an open that a close cuts short", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "opening");
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 8_000 });
    await expect(page.locator("[data-slot=ombra-readout-open]")).toHaveText(/^Open \d+\.\d ms/);
    await expect(page.locator("[data-slot=ombra-readout-close]")).toHaveText(/^Close \d+\.\d ms/);
  });

  test("selects the engine from the query string", async ({ page }) => {
    await page.goto("/spike?engine=vt");
    await expect(page.getByRole("radio", { name: "View Transition" })).toBeChecked();

    await page.goto("/spike?engine=flip");
    await expect(page.getByRole("radio", { name: "FLIP" })).toBeChecked();

    await page.goto("/spike?engine=fade");
    await expect(page.getByRole("radio", { name: "Fade" })).toBeChecked();
  });

  test("keeps the track still while zoomed", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).click();

    const viewer = page.locator("[data-slot=ombra-viewer]");
    const track = page.locator("[data-slot=ombra-track]");

    await expect(viewer).toBeVisible();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(viewer).toHaveAttribute("data-zoomed", "true");

    const before = await track.evaluate((node) => node.scrollLeft);

    await track.dispatchEvent("wheel", { deltaX: 40, deltaY: 0, bubbles: true, cancelable: true });
    await expect.poll(async () => track.evaluate((node) => node.scrollLeft)).toBe(before);

    await page.keyboard.press("0");
    await expect(viewer).toHaveAttribute("data-zoomed", "false");
  });

  test("centers the slide and the thumbnail strip", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=fade");

    const gutter = () =>
      page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);

    const gutterBefore = await gutter();

    await page.locator("[data-slot=ombra-trigger]").last().click();

    const viewer = page.locator("[data-slot=ombra-viewer]");

    await expect(viewer).toHaveAttribute("data-phase", "open");
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(
      `${photoCount} / ${photoCount}`,
    );

    const layout = () =>
      page.evaluate(() => {
        const track = document.querySelector("[data-slot=ombra-track]");
        const slide = document.querySelector("[data-slot=ombra-slide][data-active=true]");
        const strip = document.querySelector("[data-slot=ombra-thumbnails]");
        const row = document.querySelector("[data-slot=ombra-thumbnails-row]");
        const thumb = document.querySelector("[data-slot=ombra-thumbnail][data-active=true]");
        const popup = document.querySelector("[data-slot=ombra-viewer]");

        if (
          !(track instanceof HTMLElement) ||
          !(slide instanceof HTMLElement) ||
          !(strip instanceof HTMLElement) ||
          !(row instanceof HTMLElement) ||
          !(thumb instanceof HTMLElement) ||
          !(popup instanceof HTMLElement)
        ) {
          return null;
        }

        const trackRect = track.getBoundingClientRect();
        const slideRect = slide.getBoundingClientRect();
        const stripRect = strip.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const thumbRect = thumb.getBoundingClientRect();
        const thumbs = row.querySelectorAll("[data-slot=ombra-thumbnail]");
        let content = 0;

        for (const item of thumbs) {
          content += item.getBoundingClientRect().width;
        }

        if (thumbs.length > 1) content += 8 * (thumbs.length - 1);

        const readout = popup.querySelector("[data-slot=ombra-readout]");
        const readoutRect = readout instanceof HTMLElement ? readout.getBoundingClientRect() : null;

        return {
          slideDelta: Math.abs(
            slideRect.left + slideRect.width / 2 - (trackRect.left + trackRect.width / 2),
          ),
          fits: content <= strip.clientWidth + 1,
          rowDelta: Math.abs(
            rowRect.left + rowRect.width / 2 - (stripRect.left + stripRect.width / 2),
          ),
          thumbDelta: Math.abs(
            thumbRect.left + thumbRect.width / 2 - (stripRect.left + stripRect.width / 2),
          ),
          thumbInside:
            thumbRect.top >= stripRect.top - 1 &&
            thumbRect.bottom <= stripRect.bottom + 1 &&
            thumbRect.left >= stripRect.left - 1 &&
            thumbRect.right <= stripRect.right + 1,
          readoutClearsStrip: readoutRect === null || readoutRect.bottom <= stripRect.top,
          trackBar: track.offsetWidth - track.clientWidth,
          stripBar: strip.offsetHeight - strip.clientHeight,
          popupOverflows: popup.scrollHeight > popup.clientHeight + 1,
          trackScrollbar: getComputedStyle(track).scrollbarWidth,
          stripScrollbar: getComputedStyle(strip).scrollbarWidth,
        };
      });

    await expect.poll(async () => (await layout())?.slideDelta ?? 99).toBeLessThan(3);
    await expect.poll(async () => (await layout())?.thumbInside).toBe(true);

    const openLayout = await layout();

    if (!openLayout) throw new Error("viewer layout was not measurable");
    expect(openLayout.readoutClearsStrip).toBe(true);
    expect(openLayout.trackBar).toBe(0);
    expect(openLayout.stripBar).toBe(0);
    expect(openLayout.popupOverflows).toBe(false);
    expect(openLayout.trackScrollbar).toBe("none");
    expect(openLayout.stripScrollbar).toBe("none");

    if (openLayout.fits) expect(openLayout.rowDelta).toBeLessThan(2);
    else expect(openLayout.thumbDelta).toBeLessThan(3);

    const reach = await page.locator("[data-slot=ombra-thumbnails]").evaluate((node) => {
      const thumbs = node.querySelectorAll("[data-slot=ombra-thumbnail]");
      const first = thumbs[0];
      const last = thumbs[thumbs.length - 1];

      if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement)) return null;

      node.scrollLeft = 0;

      const start = first.getBoundingClientRect().left - node.getBoundingClientRect().left;

      node.scrollLeft = node.scrollWidth;

      const end = node.getBoundingClientRect().right - last.getBoundingClientRect().right;

      return { start, end };
    });

    expect(reach?.start).toBeGreaterThanOrEqual(-1);
    expect(reach?.end).toBeGreaterThanOrEqual(-1);

    await page.keyboard.press("Home");
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(`1 / ${photoCount}`);
    await expect.poll(async () => (await layout())?.slideDelta ?? 99).toBeLessThan(3);

    expect(await gutter()).toBe(gutterBefore);
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    expect(await gutter()).toBe(gutterBefore);
  });

  test("moves thumbnail selection with the track without flashing the destination", async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=fade");
    await page.getByRole("button", { name: "Sunlit path through a dense green forest" }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const strip = page.locator("[data-slot=ombra-thumbnails]");
    const thumbs = strip.locator("[data-slot=ombra-thumbnail]");

    const track = page.locator("[data-slot=ombra-track]");

    // Native smooth scrolling can coalesce every intermediate frame on a busy
    // WebKit runner. Capture the requested target, then advance the real track
    // one slide at a time to check selection ownership independently of cadence.
    await track.evaluate((node) => {
      const scrollTo = node.scrollTo.bind(node);

      Object.defineProperty(node, "scrollTo", {
        value(options: ScrollToOptions) {
          if (options.behavior === "smooth") {
            node.dataset.requestedLeft = String(options.left);
          } else scrollTo(options);
        },
      });
    });

    await strip.evaluate((node) => {
      const observer = new MutationObserver(() => {
        const buttons = Array.from(node.querySelectorAll("[data-slot=ombra-thumbnail]"));
        const active = buttons.findIndex((button) => button.getAttribute("data-active") === "true");

        node.setAttribute(
          "data-selection-history",
          `${node.getAttribute("data-selection-history")},${active}`,
        );
      });

      observer.observe(node, { attributes: true, subtree: true, attributeFilter: ["data-active"] });
    });

    for (const [from, to] of [
      [2, 6],
      [6, 2],
    ]) {
      await strip.evaluate((node, start) => {
        node.setAttribute("data-selection-history", String(start));
      }, from);

      if (isMobile) await thumbs.nth(to).tap();
      else await thumbs.nth(to).click();

      await expect(track).toHaveAttribute("data-requested-left", /./);
      await expect(thumbs.nth(from)).toHaveAttribute("aria-current", "true");

      const direction = Math.sign(to - from);

      for (let index = from + direction; index !== to + direction; index += direction) {
        await track.evaluate((node, target) => {
          const slide = node.querySelectorAll("[data-slot=ombra-slide]")[target];

          const left =
            node.scrollLeft +
            slide.getBoundingClientRect().left -
            node.getBoundingClientRect().left;

          node.scrollTo({ left, behavior: "instant" });
        }, index);
        await expect(thumbs.nth(index)).toHaveAttribute("aria-current", "true");
      }

      await expect
        .poll(() =>
          track.evaluate((node) => Math.abs(node.scrollLeft - Number(node.dataset.requestedLeft))),
        )
        .toBeLessThan(2);
      await expect
        .poll(() =>
          page.locator("[data-slot=ombra-track]").evaluate((track, target) => {
            const slide = track.querySelectorAll("[data-slot=ombra-slide]")[target];

            if (!slide) return 999;

            const trackRect = track.getBoundingClientRect();
            const slideRect = slide.getBoundingClientRect();

            return Math.abs(
              slideRect.left + slideRect.width / 2 - trackRect.left - trackRect.width / 2,
            );
          }, to),
        )
        .toBeLessThan(2);

      const history =
        (await strip.getAttribute("data-selection-history"))?.split(",").map(Number) ?? [];

      expect(history[0]).toBe(from);
      expect(history.at(-1)).toBe(to);
      expect(
        history.some((value) => value > Math.min(from, to) && value < Math.max(from, to)),
      ).toBe(true);

      for (let step = 1; step < history.length; step += 1) {
        expect(
          (history[step] - history[step - 1]) * direction,
          `selection history: ${history}`,
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("keeps every slide visible while the track scrolls", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=fade");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const images = page.locator("[data-slot=ombra-track] [data-slot=ombra-image]");

    await expect(images).toHaveCount(photoCount);
    await expect
      .poll(() =>
        images.evaluateAll((nodes) =>
          nodes.every(
            (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);

    await page.locator("[data-slot=ombra-track]").evaluate((track) => {
      if (!(track instanceof HTMLElement)) return;

      const slide = track.querySelectorAll("[data-slot=ombra-slide]")[6];

      if (!(slide instanceof HTMLElement)) return;

      const delta = slide.getBoundingClientRect().left - track.getBoundingClientRect().left;

      track.scrollLeft += delta - (track.clientWidth - slide.clientWidth) / 2;
    });

    await expect
      .poll(() =>
        page.evaluate(() => {
          const track = document.querySelector("[data-slot=ombra-track]");
          const slide = document.querySelectorAll("[data-slot=ombra-slide]")[6];

          if (!(track instanceof HTMLElement) || !(slide instanceof HTMLElement)) return false;

          const image = slide.querySelector("img");

          if (!(image instanceof HTMLImageElement) || image.naturalWidth === 0) return false;

          const trackRect = track.getBoundingClientRect();
          const imageRect = image.getBoundingClientRect();
          const center = trackRect.left + trackRect.width / 2;
          const imageCenter = imageRect.left + imageRect.width / 2;

          return (
            Math.abs(imageCenter - center) < 3 && imageRect.width > 40 && imageRect.height > 40
          );
        }),
      )
      .toBe(true);
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(`7 / ${photoCount}`);
    await expect(page.locator("[data-slot=ombra-caption]")).toHaveText(
      "Night, and the ridge still holding snow.",
    );
  });

  test("keeps a landscape photo at the size it opened", async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.evaluate(() => {
      const prototype = HTMLElement.prototype;
      const original = prototype.animate;

      // A dropped frame can remove the flight between animation frames, so a rAF
      // sample is the size from before the stall. The finished callback runs while
      // the element is still at the end keyframe, before the gallery removes it.
      Object.defineProperty(prototype, "animate", {
        configurable: true,
        writable: true,
        value(
          this: HTMLElement,
          keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
          options?: number | KeyframeAnimationOptions,
        ) {
          const animation = original.call(this, keyframes, options);

          if (this.dataset.slot === "ombra-flight") {
            void animation.finished.then(() => {
              const rect = this.getBoundingClientRect();

              document.documentElement.dataset.flight = `${rect.width},${rect.height}`;
            });
          }

          return animation;
        },
      });
    });
    await page
      .getByRole("button", { name: "Wooden boats tied beside a cabin on a mountain lake" })
      .click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const landed = () =>
      page.evaluate(() => {
        const recorded = document.documentElement.dataset.flight ?? "";
        const [flightWidthText, flightHeightText] = recorded.split(",");
        const flightWidth = Number(flightWidthText);
        const flightHeight = Number(flightHeightText);
        const image = document.querySelector("[data-slot=ombra-image][data-active=true]");
        const slide = document.querySelector("[data-slot=ombra-slide][data-active=true]");

        if (
          !(image instanceof HTMLImageElement) ||
          !(slide instanceof HTMLElement) ||
          image.naturalWidth <= 0
        ) {
          return null;
        }

        const rect = image.getBoundingClientRect();
        const slideRect = slide.getBoundingClientRect();
        const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
        const aspect = image.naturalWidth / image.naturalHeight;
        const height = Math.min(slideRect.height, slideRect.width / aspect);
        const width = height * aspect;

        return {
          flightWidth: Number.isFinite(flightWidth) ? flightWidth : 0,
          flightHeight: Number.isFinite(flightHeight) ? flightHeight : 0,
          paintWidth: image.naturalWidth * scale,
          paintHeight: image.naturalHeight * scale,
          containWidth: width,
          containHeight: height,
        };
      });

    await expect.poll(async () => (await landed())?.paintWidth ?? 0).toBeGreaterThan(100);

    const settled = await landed();

    if (!settled) throw new Error("open image was not measured");
    expect(Math.abs(settled.paintWidth - settled.containWidth)).toBeLessThan(2);
    expect(Math.abs(settled.paintHeight - settled.containHeight)).toBeLessThan(2);

    if (settled.flightWidth > 0) {
      expect(Math.abs(settled.paintWidth - settled.flightWidth)).toBeLessThan(3);
      expect(Math.abs(settled.paintHeight - settled.flightHeight)).toBeLessThan(3);
    }
  });

  test("does not flash the scrim when a flip close finishes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => {
      const tick = () => {
        const backdrop = document.querySelector("[data-slot=ombra-backdrop]");

        const opacity =
          backdrop instanceof HTMLElement ? Number(getComputedStyle(backdrop).opacity) : -1;

        const previous = document.documentElement.dataset.scrim ?? "";
        const faded = previous.includes("low");
        const marker = opacity < 0 ? "gone" : opacity < 0.08 ? "low" : faded ? "back" : "up";

        if (!previous.endsWith(marker)) {
          document.documentElement.dataset.scrim = previous ? `${previous} ${marker}` : marker;
        }

        if (marker !== "gone") requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.scrim))
      .toContain("gone");

    const trace = await page.evaluate(() => document.documentElement.dataset.scrim ?? "");

    expect(trace).toContain("low");
    expect(trace).not.toContain("back");
  });

  test("escape during a slow flip still closes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 8_000 });
  });

  test("uses a spring easing when the toggle is on", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1&spring=1");
    await expect(page.getByRole("button", { name: "Spring" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const flight = page.locator("[data-slot=ombra-flight]");

    await page.getByRole("button", { name: firstPhoto }).click();

    let easing = "";

    await expect
      .poll(async () => {
        easing = (await flight.getAttribute("data-easing")) ?? "";

        return easing;
      })
      .not.toBe("");

    const supportsLinear = await page.evaluate(() =>
      CSS.supports("animation-timing-function", "linear(0, 1)"),
    );

    expect(easing?.startsWith("linear(") || easing?.startsWith("cubic-bezier(")).toBe(true);
    expect(easing).not.toBe("cubic-bezier(0.22, 1, 0.36, 1)");

    if (supportsLinear) expect(easing?.startsWith("linear(")).toBe(true);
  });

  test("keeps the cubic morph easing when spring is off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1");
    await expect(page.getByRole("button", { name: "Spring" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect
      .poll(async () => page.locator("[data-slot=ombra-flight]").getAttribute("data-easing"))
      .toBe("cubic-bezier(0.22, 1, 0.36, 1)");
  });

  test("falls back to a cubic bezier when linear() is unsupported", async ({ page }) => {
    await page.addInitScript(`
      const original = CSS.supports.bind(CSS);
      CSS.supports = function (property, value) {
        const text = value === undefined ? String(property) : String(value);
        if (text.includes("linear(")) return false;
        if (value === undefined) return original(property);
        return original(property, value);
      };
    `);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1&spring=1");
    await page.getByRole("button", { name: firstPhoto }).click();

    let easing = "";

    await expect
      .poll(async () => {
        easing = (await page.locator("[data-slot=ombra-flight]").getAttribute("data-easing")) ?? "";

        return easing;
      })
      .toMatch(/^cubic-bezier\(/);

    expect(easing?.startsWith("cubic-bezier(")).toBe(true);
    expect(easing).not.toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(easing?.includes("linear(")).toBe(false);
  });

  test("writes the spring easing onto the view transition", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=vt&spring=1&slow=1");
    await expect(page.getByRole("radio", { name: "View Transition" })).toBeChecked();
    await expect(page.getByRole("button", { name: "Spring" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Slow motion on" })).toBeVisible();
    await page.getByRole("button", { name: firstPhoto }).click();

    const supportsViewTransition = await page.evaluate(() => "startViewTransition" in document);

    if (supportsViewTransition) {
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue("--ombra-vt-easing").trim(),
          ),
        )
        .toMatch(/linear\(|cubic-bezier\(/);

      const easing = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--ombra-vt-easing").trim(),
      );

      expect(easing).not.toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    } else {
      await expect
        .poll(async () => page.locator("[data-slot=ombra-flight]").getAttribute("data-easing"))
        .not.toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    }
  });

  test("springs the zoom button when the toggle is on", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1&spring=1");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.getByRole("button", { name: "Zoom in" }).click();

    await expect
      .poll(() =>
        page
          .locator("[data-slot=ombra-zoom]")
          .first()
          .evaluate((node) => {
            const animation = node.getAnimations()[0];
            const effect = animation?.effect;

            if (!effect) return "";

            return effect.getTiming().easing ?? "";
          }),
      )
      .toMatch(/^linear\(|^cubic-bezier\(/);
  });

  test("keeps zoom instant when spring is off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-zoomed", "true");

    const running = await page
      .locator("[data-slot=ombra-zoom]")
      .first()
      .evaluate((node) => node.getAnimations().length);

    expect(running).toBe(0);
  });

  test("reduced motion stays on the fade when spring is on", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=flip&spring=1");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-engine", "fade");
  });

  test("the spring switch shares the address bar with the engine and slow motion", async ({
    page,
  }) => {
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: "Spring" }).click();
    await expect.poll(() => page.url()).toContain("spring=1");
    await page.getByRole("button", { name: "Slow motion" }).click();
    await expect.poll(() => page.url()).toContain("slow=1");
    await expect.poll(() => page.url()).toContain("engine=flip");
  });

  test("opens with flip when view transitions are missing", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Document.prototype, "startViewTransition", {
        configurable: true,
        writable: true,
        value: undefined,
      });
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=vt");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const vtDuration = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--ombra-vt-duration").trim(),
    );

    expect(vtDuration).toBe("");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-zoomed", "true");
  });

  test("keeps the scrim and sheet where the pull released", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

    const track = page.locator("[data-slot=ombra-track]");
    const box = await track.boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + Math.min(72, box.height / 3);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 220, { steps: 10 });

    const before = await page.evaluate(() => {
      const backdrop = document.querySelector("[data-slot=ombra-backdrop]");
      const sheet = document.querySelector("[data-slot=ombra-sheet]");

      return {
        opacity: backdrop instanceof HTMLElement ? Number(getComputedStyle(backdrop).opacity) : 1,
        ty: sheet instanceof HTMLElement ? new DOMMatrix(getComputedStyle(sheet).transform).m42 : 0,
      };
    });

    expect(before.ty).toBeGreaterThan(24);
    expect(before.opacity).toBeLessThan(0.92);
    await page.mouse.up();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)));
        }),
    );

    const after = await page.evaluate(() => {
      const backdrop = document.querySelector("[data-slot=ombra-backdrop]");
      const sheet = document.querySelector("[data-slot=ombra-sheet]");

      return {
        opacity: backdrop instanceof HTMLElement ? Number(getComputedStyle(backdrop).opacity) : 1,
        ty: sheet instanceof HTMLElement ? new DOMMatrix(getComputedStyle(sheet).transform).m42 : 0,
      };
    });

    expect(after.opacity).toBeLessThan(before.opacity + 0.08);
    expect(after.ty).toBeGreaterThan(20);
  });

  test("a second pull cancels the snap-back", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

    const track = page.locator("[data-slot=ombra-track]");
    const box = await track.boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + Math.min(72, box.height / 3);

    await page.mouse.move(x, y);
    await page.mouse.down();

    for (let step = 1; step <= 8; step += 1) {
      await page.mouse.move(x, y + step * 8);
      await page.waitForTimeout(30);
    }

    await page.mouse.up();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 220, { steps: 8 });

    const progress = await page.evaluate(() =>
      Number(getComputedStyle(document.documentElement).getPropertyValue("--ombra-pull-live")),
    );

    expect(progress).toBeGreaterThan(0.25);
    await page.mouse.up();
  });

  test("a pull after a finished snap-back still moves the photo and closes from there", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

    const box = await page.locator("[data-slot=ombra-track]").boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    const sheetY = () =>
      page.evaluate(() => {
        const sheet = document.querySelector("[data-slot=ombra-sheet]");

        if (!(sheet instanceof HTMLElement)) throw new Error("the viewer closed");

        return new DOMMatrix(getComputedStyle(sheet).transform).m42;
      });

    // A short, slow pull, so it is not a flick: released and left to spring all the way back.
    await page.mouse.move(x, y);
    await page.mouse.down();

    for (let step = 1; step <= 6; step += 1) {
      await page.mouse.move(x, y + step * 10);
      await page.waitForTimeout(30);
    }

    await page.waitForTimeout(160);
    await page.mouse.up();
    await expect.poll(sheetY).toBe(0);
    await page.waitForTimeout(200);
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const rest = await page.locator("[data-slot=ombra-slide][data-active=true]").boundingBox();

    // The next pull, the other way, must still move the photo with the pointer.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 200, { steps: 10 });
    expect(await sheetY()).toBeLessThan(-24);

    // And the close leaves from where the pull let go, not from the centre.
    await page.evaluate(() => {
      window.ombraFirstFlight = new Promise((resolve) => {
        const tick = () => {
          const flight = document.querySelector("[data-slot=ombra-flight]");

          if (!flight) {
            requestAnimationFrame(tick);

            return;
          }

          // Measured at the flight's first frame, however late this frame comes: on a
          // slow runner the flight can already be on its way by the first one seen here.
          const animations = flight.getAnimations();
          const times = animations.map((animation) => animation.currentTime);

          for (const animation of animations) animation.currentTime = 0;

          const box = flight.getBoundingClientRect();

          animations.forEach((animation, index) => {
            const time = times[index];

            if (time !== null) animation.currentTime = time;
          });

          resolve(box.y + box.height / 2);
        };

        requestAnimationFrame(tick);
      });
    });
    await page.mouse.up();

    const flightCentre = await page.evaluate(() => window.ombraFirstFlight);

    if (!rest || flightCentre === undefined) throw new Error("no slide or flight");

    expect(flightCentre).toBeLessThan(rest.y + rest.height / 2 - 24);
  });

  test("a pointerup outside the track does not swallow the next pull", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=fade");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

    const track = page.locator("[data-slot=ombra-track]");
    const box = await track.boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;

    await page.mouse.move(x, box.y + 2);
    await page.mouse.down();
    await page.mouse.move(x, box.y - 5);
    await page.mouse.up();
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, box.y + box.height / 2 + 180, { steps: 8 });

    const progress = await page.evaluate(() =>
      Number(document.documentElement.style.getPropertyValue("--ombra-pull-live") || "0"),
    );

    expect(progress).toBeGreaterThan(0.1);
    await page.mouse.up();
  });

  test("reduced motion can still pull to dismiss", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

    const track = page.locator("[data-slot=ombra-track]");
    const box = await track.boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + Math.min(72, box.height / 3);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 200, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("an upward pull pushes the sheet up and dismisses", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

    const track = page.locator("[data-slot=ombra-track]");
    const box = await track.boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height - Math.min(72, box.height / 3);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 200, { steps: 10 });

    const pulled = await page.evaluate(() => {
      const backdrop = document.querySelector("[data-slot=ombra-backdrop]");
      const sheet = document.querySelector("[data-slot=ombra-sheet]");

      const matrix =
        sheet instanceof HTMLElement ? new DOMMatrix(getComputedStyle(sheet).transform) : null;

      return {
        progress: Number(document.documentElement.style.getPropertyValue("--ombra-pull-live")),
        opacity: backdrop instanceof HTMLElement ? Number(getComputedStyle(backdrop).opacity) : 1,
        ty: matrix?.m42 ?? 0,
        scale: matrix?.a ?? 1,
      };
    });

    expect(pulled.progress).toBeLessThan(-0.1);
    expect(pulled.ty).toBeLessThan(-24);
    // The sheet shrinks and the scrim fades by the size of the pull, whichever way it goes.
    expect(pulled.scale).toBeLessThan(1);
    expect(pulled.opacity).toBeLessThan(0.92);
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("a fast flick shorter than the dismiss distance dismisses", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

    const box = await page.locator("[data-slot=ombra-track]").boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    // 70px, well under the 110px distance, in 40ms: only its speed (about 1750px/s) can
    // close it. Sent in one task with a fixed wait between events, so a loaded runner
    // cannot spread the moves out and slow the measured flick below the threshold.
    await page.evaluate(
      ({ x, y }) => {
        const track = document.querySelector("[data-slot=ombra-track]");

        if (!track) throw new Error("no track");

        const send = (type: string, clientY: number) => {
          const init = { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true };

          track.dispatchEvent(new PointerEvent(type, { ...init, button: 0, clientX: x, clientY }));
        };

        const wait = (ms: number) => {
          const until = performance.now() + ms;

          while (performance.now() < until) {
            // A busy wait: the events must stay in this task, a fixed time apart.
          }
        };

        send("pointerdown", y);

        for (let step = 1; step <= 4; step += 1) {
          wait(10);
          send("pointermove", y + step * 17.5);
        }

        send("pointerup", y + 70);
      },
      { x, y },
    );
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("a sideways mouse drag never pulls", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
    await watchPull(page);

    const box = await page.locator("[data-slot=ombra-track]").boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 200, y + 40, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const seen = await readPull(page);

    expect(seen.pulled).toBe(false);
    expect(seen.peak).toBe(0);
  });

  test.describe("trackpad", () => {
    test.skip(({ isMobile }) => isMobile, "a trackpad swipe is a desktop input");

    async function openAndHover(page: Page, query: string) {
      await page.goto(`/spike?${query}`);
      await page.getByRole("button", { name: firstPhoto }).click();
      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

      const box = await page.locator("[data-slot=ombra-track]").boundingBox();

      if (!box) throw new Error("track had no box");

      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }

    async function swipe(page: Page, deltaX: number, deltaY: number, events: number) {
      for (let step = 0; step < events; step += 1) {
        await page.mouse.wheel(deltaX, deltaY);
        await page.waitForTimeout(16);
      }
    }

    for (const [direction, deltaY] of [
      ["down", -40],
      ["up", 40],
    ] as const) {
      test(`a two-finger swipe ${direction} dismisses`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await openAndHover(page, "engine=flip");
        await swipe(page, 0, deltaY, 8);
        await expect(page.getByRole("dialog")).toBeHidden();
      });
    }

    test("the photo follows the fingers and springs back after a short swipe", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await openAndHover(page, "engine=flip");

      // Short: under the distance threshold, and too short to count as a flick.
      await swipe(page, 0, -8, 3);

      // The snap-back animates the variable but leaves the inline value until it ends.
      const progress = await page.evaluate(() =>
        Number(document.documentElement.style.getPropertyValue("--ombra-pull-live")),
      );

      // Fingers moving down scroll with negative deltaY, and pull the photo down.
      expect(progress).toBeGreaterThan(0.01);
      await expect
        .poll(() =>
          page.evaluate(() =>
            Number(
              getComputedStyle(document.documentElement).getPropertyValue("--ombra-pull-live"),
            ),
          ),
        )
        .toBe(0);
      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute(
        "data-pulling",
        "false",
      );
      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    });

    test("a second burst during the snap-back carries on from where the photo is", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      // Slow motion keeps the snap-back running across the runner's gaps.
      await openAndHover(page, "engine=flip&slow=1");
      await page.evaluate(() => {
        const live = () =>
          Number(getComputedStyle(document.documentElement).getPropertyValue("--ombra-pull-live"));

        const log: { before: number; after: number }[] = [];
        let before = 0;

        window.ombraWheelCatch = log;
        // Capture runs before the track's handler and the bubble listener after it.
        window.addEventListener("wheel", () => (before = live()), { capture: true });
        window.addEventListener("wheel", () => log.push({ before, after: live() }));
      });

      // Fingers up push the photo up, short of the threshold.
      await swipe(page, 0, 10, 6);
      // The wheel goes quiet (140 ms) and the photo starts springing back.
      await page.waitForTimeout(160);
      // The momentum arrives as a second burst while it springs back.
      await page.mouse.wheel(0, 10);

      await expect.poll(() => page.evaluate(() => window.ombraWheelCatch?.length ?? 0)).toBe(7);

      const caught = await page.evaluate(() => window.ombraWheelCatch?.[6]);

      if (!caught) throw new Error("the second burst was not logged");

      // The photo was still on its way back, so the catch is meaningful.
      expect(caught.before).toBeLessThan(-0.02);
      // It moves on up from there instead of jumping back to the centre first.
      expect(caught.after).toBeLessThan(caught.before);
    });

    test("a horizontal swipe leaves the pull alone", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await openAndHover(page, "engine=flip");

      // Where the scroll lands differs between engines, so watch what the pull does
      // instead: it must leave every event to the native scroll and never move.
      await page.evaluate(() => {
        const seen = { prevented: 0, events: 0, pull: 0 };

        window.ombraWheelSeen = seen;
        window.addEventListener("wheel", (event) => {
          seen.events += 1;

          if (event.defaultPrevented) seen.prevented += 1;

          const pull = Number(
            document.documentElement.style.getPropertyValue("--ombra-pull-live") || "0",
          );

          seen.pull = Math.max(seen.pull, Math.abs(pull));
        });
      });
      await swipe(page, 40, 6, 12);
      await page.waitForTimeout(300);
      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

      const seen = await page.evaluate(() => window.ombraWheelSeen);

      if (!seen) throw new Error("no wheel log");

      expect(seen.events).toBe(12);
      expect(seen.prevented).toBe(0);
      expect(seen.pull).toBe(0);
    });

    test("a vertical swipe straight after a sideways one dismisses", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await openAndHover(page, "engine=flip");

      // To the next photo, then down with no pause: the sideways momentum and the
      // track's snap are both still running when the vertical swipe begins.
      await swipe(page, 40, 0, 6);
      await swipe(page, 0, -40, 8);

      await expect(page.getByRole("dialog")).toBeHidden();
    });

    test("a sideways swipe straight after a short vertical one changes the photo", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await openAndHover(page, "engine=flip");

      // A small push up, then sideways with no pause, while the wheel is still busy.
      await swipe(page, 0, 8, 3);
      await swipe(page, 40, 0, 8);

      await expect
        .poll(() => page.locator("[data-slot=ombra-track]").evaluate((track) => track.scrollLeft))
        .toBeGreaterThan(100);
      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    });

    test("a sideways swipe lets a snap-back finish", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await openAndHover(page, "engine=flip");

      // A short pull, then the wheel goes quiet and the photo starts springing back.
      await swipe(page, 0, 10, 6);
      await page.waitForTimeout(160);

      // A long sideways swipe while it springs back: the photo goes on settling.
      for (let step = 0; step < 30; step += 1) {
        await page.mouse.wheel(step % 2 === 0 ? 30 : -30, 0);
        await page.waitForTimeout(16);
      }

      const live = await page.evaluate(() =>
        Number(getComputedStyle(document.documentElement).getPropertyValue("--ombra-pull-live")),
      );

      expect(live).toBe(0);
    });

    test("a page scroll that runs on into the opening leaves the viewer open", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto("/spike?engine=flip");
      await page.waitForLoadState("networkidle");

      const trigger = page.getByRole("button", { name: firstPhoto });

      await trigger.scrollIntoViewIfNeeded();

      const box = await trigger.boundingBox();

      if (!box) throw new Error("thumbnail had no box");

      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;

      // A free-spinning wheel keeps sending events through the click that opens the
      // viewer. They come from the page's own clock, so a busy test runner cannot open
      // gaps in the stream that a real wheel would not have.
      await page.evaluate(
        ({ x, y }) => {
          let last = performance.now();

          window.ombraStreamGap = 0;

          const stream = window.setInterval(() => {
            const now = performance.now();

            window.ombraStreamGap = Math.max(window.ombraStreamGap ?? 0, now - last);
            last = now;
            document.elementFromPoint(x, y)?.dispatchEvent(
              new WheelEvent("wheel", {
                deltaY: 4,
                clientX: x,
                clientY: y,
                bubbles: true,
                cancelable: true,
              }),
            );
          }, 16);

          window.setTimeout(() => window.clearInterval(stream), 900);
        },
        { x, y },
      );
      await page.waitForTimeout(150);
      await page.mouse.click(x, y);
      await page.waitForTimeout(900);

      const gap = await page.evaluate(() => window.ombraStreamGap ?? 0);

      // A stalled page delays the timer, and a gap that long rightly starts a new
      // stream. Real wheel events keep their own timestamps and have no such gap.
      test.skip(gap >= 140, `the page stalled for ${Math.round(gap)} ms`);

      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    });

    test("a pinch does not pull", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openAndHover(page, "engine=fade");
      await page.keyboard.down("Control");
      await swipe(page, 0, 20, 8);
      await page.keyboard.up("Control");
      await page.waitForTimeout(300);
      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    });

    test("reduced motion still dismisses on a swipe", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openAndHover(page, "engine=flip");
      await swipe(page, 0, -40, 8);
      await expect(page.getByRole("dialog")).toBeHidden();
    });

    /** Logs whether each wheel event was claimed, then sends `deltas` one by one. */
    async function sendLogged(page: Page, deltas: readonly number[], untilClosed = true) {
      await page.evaluate(() => {
        const log: { t: number; prevented: boolean; viewer: boolean }[] = [];

        window.ombraWheelLog = log;
        window.addEventListener("wheel", (event) => {
          log.push({
            t: event.timeStamp,
            prevented: event.defaultPrevented,
            viewer: document.querySelector("[data-slot=ombra-viewer]") !== null,
          });
        });
      });

      for (const delta of deltas) {
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(16);
      }

      if (!untilClosed) return [];

      await expect(page.getByRole("dialog")).toBeHidden();

      const log = await page.evaluate(() => window.ombraWheelLog ?? []);

      expect(log).toHaveLength(deltas.length);

      // A real trackpad sends every frame. Under a loaded test runner events can
      // arrive far apart, and a gap that long rightly ends the swallow on its own,
      // so a claim is only required of events that follow the previous one closely.
      return log.map((entry, index) => ({
        ...entry,
        unbroken: log.slice(1, index + 1).every((next, at) => next.t - log[at].t < 250),
      }));
    }

    // Past the threshold on the third event, then a tail that decays the way a trackpad's does.
    const close = [40, 40, 40, 40];
    const tail = [30, 22, 16, 11, 7, 4, 2];

    test("the swipe's momentum does not scroll the page after the close", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openAndHover(page, "engine=fade");

      const log = await sendLogged(page, [...close, ...tail]);

      expect(log.filter((entry) => entry.unbroken && !entry.prevented)).toEqual([]);
    });

    /** Keeps a faint tail coming until the viewer has gone, as a long flick's momentum does. */
    async function tailUntilClosed(page: Page) {
      for (let step = 0; step < 60; step += 1) {
        if ((await page.locator("[data-slot=ombra-viewer]").count()) === 0) return;

        await page.mouse.wheel(0, 2);
        await page.waitForTimeout(16);
      }

      throw new Error("the viewer never closed");
    }

    test("a scroll started right after the close reaches the page", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openAndHover(page, "engine=fade");

      await sendLogged(page, [...close, ...tail], false);
      await tailUntilClosed(page);

      // The fingers land again while the tail decays and scroll on: the wheel picks up.
      const rising = [3, 6, 12, 20, 30, 40, 40, 40];
      const count = await page.evaluate(() => window.ombraWheelLog?.length ?? 0);

      for (const delta of rising) {
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(16);
      }

      await expect
        .poll(() => page.evaluate(() => window.ombraWheelLog?.length ?? 0))
        .toBe(count + rising.length);

      const fresh = await page.evaluate(
        (from) => window.ombraWheelLog?.slice(from) ?? [],
        count + 2,
      );

      expect(fresh.filter((entry) => entry.prevented)).toEqual([]);
    });

    test("a scroll the other way right after the close reaches the page", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openAndHover(page, "engine=fade");

      const log = await sendLogged(page, [...close, 30, 22, -4, -10, -20, -30]);

      expect(log.slice(close.length + 2).filter((entry) => entry.prevented)).toEqual([]);
    });

    test("mouse wheel notches right after the close reach the page", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openAndHover(page, "engine=fade");

      // Notches do not decay, so a steady run of them is a scroll, not momentum. The
      // ones that land while the viewer is still closing are held back with the rest.
      const log = await sendLogged(page, [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
      const after = log.filter((entry) => !entry.viewer);

      // Three notches that hold steady prove a scroll, and they may all fall in the close.
      expect(after.length).toBeGreaterThan(2);
      expect(after.slice(2).filter((entry) => entry.prevented)).toEqual([]);
    });

    test("a noisy momentum stays off the page while the viewer closes", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await openAndHover(page, "engine=flip");
      // The last photo's thumbnail is below the fold, so the close leaves the page unlocked.
      await page.keyboard.press("End");
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)));

      // A recorded Chrome trackpad flick up: past the threshold on the sixth event,
      // then momentum that jumps from 24 to 114 where Chrome merged events.
      const flick = [1, 1, 3, 11, 64, 49, 39, 24, 52, 114, 56, 54, 51, 52, 49, 47, 43, 39];
      const momentum = [37, 33, 31, 28, 26, 24, 21, 19, 17, 16, 14, 14, 13, 12, 10, 18, 8, 7];
      const log = await sendLogged(page, [...flick, ...momentum]);

      // As in the other momentum specs, an event after a runner stall is free to pass.
      expect(log.filter((entry) => entry.viewer && entry.unbroken && !entry.prevented)).toEqual([]);
    });
  });

  test("keeps a zoomed photo inside its slide while panning", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=fade");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-zoomed", "true");

    const track = page.locator("[data-slot=ombra-track]");
    const box = await track.boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 900, y, { steps: 12 });
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)));
        }),
    );

    const pose = await page.evaluate(() => {
      const slide = document.querySelector("[data-slot=ombra-slide][data-active=true]");
      const layer = slide?.querySelector("[data-slot=ombra-zoom]");

      if (!(slide instanceof HTMLElement) || !(layer instanceof HTMLElement)) return null;

      const slideRect = slide.getBoundingClientRect();
      const layerRect = layer.getBoundingClientRect();

      return {
        gap: Math.max(layerRect.left - slideRect.left, slideRect.right - layerRect.right),
        scale: new DOMMatrix(getComputedStyle(layer).transform).a,
      };
    });

    expect(pose?.scale ?? 0).toBeGreaterThan(1.3);
    expect(pose?.gap ?? 99).toBeGreaterThan(-8);
    expect(pose?.gap ?? 99).toBeLessThan(8);
    await page.mouse.up();
  });

  test("a second ctrl+wheel stays on the point under the cursor", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=fade");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const edges = await page.evaluate(() => {
      const slide = document.querySelector("[data-slot=ombra-slide][data-active=true]");
      const layer = slide?.querySelector("[data-slot=ombra-zoom]");
      const track = document.querySelector("[data-slot=ombra-track]");

      if (
        !(slide instanceof HTMLElement) ||
        !(layer instanceof HTMLElement) ||
        !(track instanceof HTMLElement)
      ) {
        return [];
      }

      const lefts: number[] = [];

      for (let step = 0; step < 2; step += 1) {
        const rect = layer.getBoundingClientRect();

        track.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: -80,
            clientX: rect.left + 2,
            clientY: rect.top + rect.height / 2,
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
        lefts.push(layer.getBoundingClientRect().left);
      }

      return lefts;
    });

    expect(edges.length).toBe(2);
    expect(Math.abs((edges[1] ?? 0) - (edges[0] ?? 0))).toBeLessThan(6);
  });

  test("a second zoom does not jump a spring that is still moving", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1&spring=1");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const layer = document.querySelector(
            "[data-slot=ombra-slide][data-active=true] [data-slot=ombra-zoom]",
          );

          if (!(layer instanceof HTMLElement)) return 0;

          return new DOMMatrix(getComputedStyle(layer).transform).a;
        }),
      )
      .toBeGreaterThan(1.05);

    const jump = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const layer = document.querySelector(
            "[data-slot=ombra-slide][data-active=true] [data-slot=ombra-zoom]",
          );

          const button = document.querySelector("[data-slot=ombra-zoom-in]");

          if (!(layer instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
            resolve(99);

            return;
          }

          const before = new DOMMatrix(getComputedStyle(layer).transform).a;

          button.click();
          requestAnimationFrame(() => {
            const after = new DOMMatrix(getComputedStyle(layer).transform).a;

            resolve(Math.abs(after - before));
          });
        }),
    );

    expect(jump).toBeLessThan(0.08);
  });
});

test.describe("touch pull", () => {
  test("a drag down straight after a flick to the next photo dismisses", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium" || !test.info().project.name.includes("mobile"),
      "Needs CDP touch input",
    );

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).tap();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

    const cdp = await context.newCDPSession(page);
    const box = await page.locator("[data-slot=ombra-track]").boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    // A quick flick to the next photo.
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });

    for (let step = 1; step <= 6; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - step * 30, y }],
      });
    }

    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    // Straight down while the track still snaps.
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });

    for (let step = 1; step <= 10; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + step * 20 }],
      });
    }

    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("a sideways swipe changes the photo and never starts a pull", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium" || !test.info().project.name.includes("mobile"),
      "Needs CDP touch input",
    );

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).tap();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
    await watchPull(page);

    const cdp = await context.newCDPSession(page);
    const box = await page.locator("[data-slot=ombra-track]").boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    // Sideways with some vertical drift, as a real thumb swipe has.
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });

    for (let step = 1; step <= 8; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - step * 25, y: y + step * 6 }],
      });
    }

    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect(page.locator("[data-slot=ombra-slide][data-active=true]")).not.toHaveAttribute(
      "aria-label",
      /^1 of /,
    );
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const seen = await readPull(page);

    expect(seen.pulled).toBe(false);
    expect(seen.peak).toBe(0);
  });

  test("a short slow pull with sideways drift springs back on the same photo", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium" || !test.info().project.name.includes("mobile"),
      "Needs CDP touch input",
    );

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).tap();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
    await watchPull(page);

    const track = page.locator("[data-slot=ombra-track]");
    const startLeft = await track.evaluate((element) => element.scrollLeft);
    const cdp = await context.newCDPSession(page);
    const box = await track.boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    // Mostly down, drifting sideways, short and slow: under both thresholds.
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });

    for (let step = 1; step <= 8; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + step * 4, y: y + step * 9 }],
      });
      await page.waitForTimeout(30);
    }

    // Hold still, so the release has no speed left.
    await page.waitForTimeout(200);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(getComputedStyle(document.documentElement).getPropertyValue("--ombra-pull-live")),
        ),
      )
      .toBe(0);
    await page.waitForTimeout(400);
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await expect(page.locator("[data-slot=ombra-slide][data-active=true]")).toHaveAttribute(
      "aria-label",
      /^1 of /,
    );
    expect(await track.evaluate((element) => element.scrollLeft)).toBe(startLeft);

    const seen = await readPull(page);

    expect(seen.pulled).toBe(true);
    expect(seen.peak).toBeGreaterThan(0.05);
  });
});

/** Records, every frame, whether the viewer ever pulled and the largest pull it showed. */
async function watchPull(page: Page) {
  await page.evaluate(() => {
    const seen = { pulled: false, peak: 0 };

    window.ombraPullSeen = seen;

    const tick = () => {
      const viewer = document.querySelector("[data-slot=ombra-viewer]");

      const live = Number(
        getComputedStyle(document.documentElement).getPropertyValue("--ombra-pull-live") || "0",
      );

      if (viewer?.getAttribute("data-pulling") === "true") seen.pulled = true;

      seen.peak = Math.max(seen.peak, Math.abs(live));
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

async function readPull(page: Page) {
  const seen = await page.evaluate(() => window.ombraPullSeen);

  if (!seen) throw new Error("watchPull was not installed");

  return seen;
}
