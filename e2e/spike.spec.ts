import { expect, test } from "@playwright/test";

const firstPhoto = "Desert road through red rock toward a distant peak";

test.describe("spike viewer", () => {
  test("opens, moves with the keyboard, and returns focus", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=fade");

    const trigger = page.getByRole("button", { name: firstPhoto });

    await trigger.click();

    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText("1 / 12");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("status")).toContainText("2 of 12");
    await page.keyboard.press("Home");
    await expect(page.getByRole("status")).toContainText("1 of 12");
    await page.keyboard.press("End");
    await expect(page.getByRole("status")).toContainText("12 of 12");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Granite cliff rising over a sunlit meadow" }),
    ).toBeFocused();
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

    await page.getByRole("button", { name: "Granite cliff rising over a sunlit meadow" }).click();

    const viewer = page.locator("[data-slot=ombra-viewer]");

    await expect(viewer).toHaveAttribute("data-phase", "open");
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText("12 / 12");

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
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText("1 / 12");
    await expect.poll(async () => (await layout())?.slideDelta ?? 99).toBeLessThan(3);

    expect(await gutter()).toBe(gutterBefore);
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    expect(await gutter()).toBe(gutterBefore);
  });

  test("keeps every slide visible while the track scrolls", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=fade");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const images = page.locator("[data-slot=ombra-track] [data-slot=ombra-image]");

    await expect(images).toHaveCount(12);
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
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText("7 / 12");
    await expect(page.locator("[data-slot=ombra-caption]")).toHaveText(
      "Night, and the ridge still holding snow.",
    );
  });

  test("keeps a landscape photo at the size it opened", async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.evaluate(() => {
      const tick = () => {
        const flight = document.querySelector("[data-slot=ombra-flight]");

        if (flight instanceof HTMLElement) {
          const rect = flight.getBoundingClientRect();

          document.documentElement.dataset.flight = `${rect.width},${rect.height}`;
        }

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
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
});
