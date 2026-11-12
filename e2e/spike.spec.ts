import { expect, test } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

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

  test("keeps separate frame readouts for the last open and close", async ({ page }) => {
    await page.goto("/spike?engine=flip");

    const open = page.locator("[data-slot=ombra-readout-open]");
    const close = page.locator("[data-slot=ombra-readout-close]");

    await expect(open).toHaveText("Open –");
    await expect(close).toHaveText("Close –");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await expect(open).toHaveText(/^Open \d+\.\d ms \/ \d+ @ \d+\.\d ms · clean [01]\/1$/);
    await expect(close).toHaveText("Close –");

    const opened = await open.textContent();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(close).toHaveText(/^Close \d+\.\d ms \/ \d+ @ \d+\.\d ms · clean [01]\/1$/);
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
    await page.goto("/spike?engine=flip");

    const open = page.locator("[data-slot=ombra-readout-open]");
    const close = page.locator("[data-slot=ombra-readout-close]");
    const viewer = page.locator("[data-slot=ombra-viewer]");

    for (let run = 1; run <= 2; run += 1) {
      await page.getByRole("button", { name: firstPhoto }).click();
      await expect(viewer).toHaveAttribute("data-phase", "open");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(open).toHaveText(new RegExp(`clean [0-${run}]/${run}$`));
      await expect(close).toHaveText(new RegExp(`clean [0-${run}]/${run}$`));
    }

    await page.getByRole("radio", { name: "Fade" }).check();
    await expect(open).toHaveText("Open –");
    await expect(close).toHaveText("Close –");
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
      const prototype = HTMLImageElement.prototype;
      const original = prototype.animate;

      // A dropped frame can remove the flight between animation frames, so a rAF
      // sample is the size from before the stall. The finished callback runs while
      // the element is still at the end keyframe, before the gallery removes it.
      Object.defineProperty(prototype, "animate", {
        configurable: true,
        writable: true,
        value(
          this: HTMLImageElement,
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
