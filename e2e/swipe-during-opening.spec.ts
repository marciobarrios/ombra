import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    ombraFrozen?: boolean;
    ombraAfterSwipe?: { flights: number; phase: string };
  }
}

const firstPhoto = "Desert road through red rock toward a distant peak";
const SWIPE_PX = 60;

type Measured = {
  flights: number;
  phase: string;
  scrollDelta: number;
  hero: { x: number; width: number; visibility: string };
  popupOpacity: number;
  headerOpacity: number;
  scrimOpacity: number;
  neighborOpacity: number;
};

type Before = { x: number; width: number; popupOpacity: number };

function viewer(page: Page) {
  return page.locator("[data-slot=ombra-viewer]");
}

/**
 * Freezes the next morph partway, from inside the page, as soon as it exists. The
 * runner can then take as long as it likes, which real-time races on CI cannot.
 */
async function freezeMorph(page: Page, engine: "flip" | "vt") {
  await page.evaluate(`(() => {
    const tick = () => {
      const ours = document.getAnimations().filter((animation) => {
        const effect = animation.effect;
        const target = effect.target;

        return (
          effect.pseudoElement?.startsWith("::view-transition") ||
          target?.matches("[data-slot=ombra-flight], [data-slot=ombra-backdrop], [data-slot=ombra-viewer]")
        );
      });

      const started = ${
        engine === "flip"
          ? `ours.some((animation) => animation.effect.target?.matches("[data-slot=ombra-flight]"))`
          : `ours.some((animation) => animation.effect.pseudoElement?.startsWith("::view-transition-group"))`
      };

      if (!started) {
        requestAnimationFrame(tick);

        return;
      }

      for (const animation of ours) {
        animation.pause();
        animation.currentTime = animation.effect.getComputedTiming().endTime * 0.3;
      }

      window.ombraFrozen = true;
    };

    requestAnimationFrame(tick);
  })()`);
}

async function openFrozen(page: Page, query: string, engine: "flip" | "vt", photoIndex = 0) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/spike?${query}`);
  await freezeMorph(page, engine);
  await page.locator("[data-slot=ombra-trigger]").nth(photoIndex).click();
  await page.waitForFunction(() => window.ombraFrozen === true);
  await expect(viewer(page)).toHaveAttribute("data-phase", "opening");
}

/** Moves the track, then measures and refreezes in the same task as the handoff. */
async function swipeAndMeasure(page: Page): Promise<Measured> {
  return page.evaluate(
    (distance) =>
      new Promise<Measured>((resolve) => {
        const track = document.querySelector<HTMLElement>("[data-slot=ombra-track]");

        const active = document.querySelector<HTMLElement>(
          "[data-slot=ombra-slide][data-active=true]",
        );

        const hero = active?.querySelector<HTMLElement>("[data-slot=ombra-image]");
        const popup = document.querySelector<HTMLElement>("[data-slot=ombra-viewer]");
        const backdrop = document.querySelector<HTMLElement>("[data-slot=ombra-backdrop]");
        const neighbor = active?.nextElementSibling;

        if (!track || !hero || !popup || !backdrop || !(neighbor instanceof HTMLElement)) {
          throw new Error("viewer is not mounted");
        }

        const start = track.scrollLeft;

        // Programmatic scrolls snap straight back, which a finger's do not.
        track.style.scrollSnapType = "none";
        track.addEventListener(
          "scroll",
          () => {
            for (const animation of document.getAnimations()) animation.pause();

            const rect = hero.getBoundingClientRect();
            const header = popup.querySelector("header");

            resolve({
              flights: document.querySelectorAll("[data-slot=ombra-flight]").length,
              phase: popup.dataset.phase ?? "",
              scrollDelta: track.scrollLeft - start,
              hero: {
                x: rect.x,
                width: rect.width,
                visibility: getComputedStyle(hero).visibility,
              },
              popupOpacity: Number(getComputedStyle(popup).opacity),
              headerOpacity: header ? Number(getComputedStyle(header).opacity) : -1,
              scrimOpacity: Number(getComputedStyle(backdrop).opacity),
              neighborOpacity: Number(getComputedStyle(neighbor).opacity),
            });
          },
          { once: true },
        );
        track.scrollLeft = start + distance;
      }),
    SWIPE_PX,
  );
}

/** The clone's visible frame, which is what the hero has to take over. */
async function measureFlight(page: Page): Promise<Before> {
  return page.evaluate(() => {
    const flight = document.querySelector<HTMLElement>("[data-slot=ombra-flight]");
    const popup = document.querySelector<HTMLElement>("[data-slot=ombra-viewer]");

    if (!flight || !popup) throw new Error("no flight");

    const rect = flight.getBoundingClientRect();

    return {
      x: rect.x,
      width: rect.width,
      popupOpacity: Number(getComputedStyle(popup).opacity),
    };
  });
}

async function measureViewTransition(page: Page): Promise<Before> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const group = getComputedStyle(root, "::view-transition-group(ombra-shared)");
    const matrix = new DOMMatrix(group.transform === "none" ? undefined : group.transform);

    return {
      x: matrix.e,
      width: Number.parseFloat(group.width),
      popupOpacity: Number(getComputedStyle(root, "::view-transition-new(root)").opacity),
    };
  });
}

async function finishEverything(page: Page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish();
  });
}

async function expectOneImageLeft(page: Page) {
  await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);

  const leftovers = await page.evaluate(() => ({
    heroes: [...document.querySelectorAll<HTMLElement>("[data-slot=ombra-image]")].filter(
      (image) =>
        image.style.visibility !== "" ||
        image.style.viewTransitionName !== "" ||
        image.getAnimations().length > 0,
    ).length,
    thumbs: [...document.querySelectorAll<HTMLElement>("[data-slot=ombra-trigger] img")].filter(
      (image) => image.style.visibility !== "",
    ).length,
    popup: document.querySelector<HTMLElement>("[data-slot=ombra-viewer]")?.getAnimations().length,
    pointerEvents: document.documentElement.style.getPropertyValue("--ombra-vt-pointer-events"),
  }));

  expect(leftovers.heroes).toBe(0);
  expect(leftovers.thumbs).toBe(0);
  expect(leftovers.pointerEvents).toBe("");
}

test.describe("swiping while a photo opens", () => {
  for (const query of ["engine=flip&slow=1", "engine=flip&slow=1&spring=1"]) {
    test(`hands the clone to the photo without moving it: ${query}`, async ({ page }) => {
      await openFrozen(page, query, "flip");

      const before = await measureFlight(page);

      expect(before.popupOpacity).toBeLessThan(1);

      const after = await swipeAndMeasure(page);

      expect(after.flights).toBe(0);
      expect(after.phase).toBe("opening");
      expect(after.hero.visibility).toBe("visible");
      // Same pixels as the clone, plus exactly what the track moved.
      expect(after.scrollDelta).toBeGreaterThan(0);
      expect(Math.abs(after.hero.x - (before.x - after.scrollDelta))).toBeLessThan(1);
      expect(Math.abs(after.hero.width - before.width)).toBeLessThan(1);
      // The photo stays opaque, and everything around it keeps the fade it was on.
      expect(after.popupOpacity).toBe(1);
      expect(Math.abs(after.headerOpacity - before.popupOpacity)).toBeLessThan(0.02);
      expect(Math.abs(after.neighborOpacity - before.popupOpacity)).toBeLessThan(0.02);
      expect(after.scrimOpacity).toBeGreaterThan(0);
      expect(after.scrimOpacity).toBeLessThan(1);

      await finishEverything(page);
      await expect(viewer(page)).toHaveAttribute("data-phase", "open");
      await expectOneImageLeft(page);
    });
  }

  test("keeps the slide, counter and thumbnail together", async ({ page }) => {
    await openFrozen(page, "engine=flip&slow=1", "flip");

    await page.evaluate(() => {
      const track = document.querySelector("[data-slot=ombra-track]");
      const slide = document.querySelectorAll("[data-slot=ombra-slide]")[1];

      if (track && slide) track.scrollLeft += slide.getBoundingClientRect().left;
    });

    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);
    await finishEverything(page);
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
    await expect(page.locator("[data-slot=ombra-counter]")).toContainText("2 /");
    await expect(page.locator("[data-slot=ombra-slide]").nth(1)).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.locator("[data-slot=ombra-thumbnail]").nth(1)).toHaveAttribute(
      "data-active",
      "true",
    );
    await expectOneImageLeft(page);
  });

  test("an opening with no swipe keeps the clone until it lands", async ({ page }) => {
    // Opening a later photo scrolls the track into place, which must not count.
    await openFrozen(page, "engine=flip&slow=1", "flip", 3);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );

    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(1);
    await expect(page.locator("[data-slot=ombra-image]").nth(3)).toHaveCSS("visibility", "hidden");
    await finishEverything(page);
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
    await expect(page.locator("[data-slot=ombra-counter]")).toContainText("4 /");
    await expectOneImageLeft(page);
  });

  test("closing after the handoff starts from where the photo is", async ({ page }) => {
    await openFrozen(page, "engine=flip&slow=1", "flip");
    await swipeAndMeasure(page);

    const hero = await page
      .locator("[data-slot=ombra-image]")
      .first()
      .evaluate((image) => image.getBoundingClientRect().width);

    await page.keyboard.press("Escape");
    await expect(viewer(page)).toHaveAttribute("data-phase", "closing");
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.pause();
    });

    const flight = await measureFlight(page);

    // The close has only just started from the handed-off pose.
    expect(Math.abs(flight.width - hero)).toBeLessThan(40);

    await finishEverything(page);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expectOneImageLeft(page);
  });

  for (const query of ["engine=flip&slow=1", "engine=flip&slow=1&spring=1"]) {
    test(`a downward drag cuts the opening and closes: ${query}`, async ({ page }) => {
      await openFrozen(page, query, "flip");

      const box = await page.locator("[data-slot=ombra-track]").boundingBox();

      if (!box) throw new Error("no track");

      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;

      await page.mouse.move(x, y);
      await page.mouse.down();

      for (let step = 1; step <= 6; step += 1) await page.mouse.move(x, y + step * 10);

      await expect(viewer(page)).toHaveAttribute("data-phase", "closing");
      // The close reverses the clone that was flying in, not a fresh one.
      await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(1);
      await page.mouse.up();
      await finishEverything(page);
      await expect(page.getByRole("dialog")).toBeHidden();
      await expectOneImageLeft(page);
    });
  }

  test("an upward drag leaves the opening alone", async ({ page }) => {
    await openFrozen(page, "engine=flip&slow=1", "flip");

    const box = await page.locator("[data-slot=ombra-track]").boundingBox();

    if (!box) throw new Error("no track");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();

    for (let step = 1; step <= 6; step += 1) await page.mouse.move(x, y - step * 10);

    await page.mouse.up();
    await expect(viewer(page)).toHaveAttribute("data-phase", "opening");
    await finishEverything(page);
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
    await expectOneImageLeft(page);
  });

  test("a swipe after reversing a close still hands off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1");
    await page.locator("[data-slot=ombra-trigger]").first().click();
    await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 10_000 });

    await freezeMorph(page, "flip");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.ombraFrozen === true);
    await expect(viewer(page)).toHaveAttribute("data-phase", "closing");

    // The swipe has to land while the reopened morph runs, so it starts from the page.
    await page.evaluate(() => {
      const tick = () => {
        const popup = document.querySelector<HTMLElement>("[data-slot=ombra-viewer]");
        const track = document.querySelector<HTMLElement>("[data-slot=ombra-track]");

        if (popup?.dataset.phase !== "opening" || !track) {
          requestAnimationFrame(tick);

          return;
        }

        track.addEventListener(
          "scroll",
          () => {
            window.ombraAfterSwipe = {
              flights: document.querySelectorAll("[data-slot=ombra-flight]").length,
              phase: popup.dataset.phase ?? "",
            };
          },
          { once: true },
        );
        track.style.scrollSnapType = "none";
        track.scrollLeft += 60;
      };

      requestAnimationFrame(tick);
    });

    const box = await page.locator("[data-slot=ombra-flight]").boundingBox();

    if (!box) throw new Error("no flight box");

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => window.ombraAfterSwipe !== undefined);

    // Measured in the scroll's own task, because the clone also leaves when the morph ends.
    expect(await page.evaluate(() => window.ombraAfterSwipe)).toEqual({
      flights: 0,
      phase: "opening",
    });
    await expect(page.locator("[data-slot=ombra-image]").first()).toHaveCSS(
      "visibility",
      "visible",
    );
    await finishEverything(page);
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
    await expectOneImageLeft(page);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);
  });

  test("view transitions let the swipe through and hand off", async ({ page }) => {
    await page.goto("/spike");

    const supported = await page.evaluate(() => "startViewTransition" in document);

    test.skip(!supported, "This browser has no View Transition API");

    await openFrozen(page, "engine=vt&slow=1", "vt");

    const pointerEvents = await page.evaluate(
      () => getComputedStyle(document.documentElement, "::view-transition").pointerEvents,
    );

    expect(pointerEvents).toBe("none");

    const before = await measureViewTransition(page);
    const after = await swipeAndMeasure(page);

    expect(after.phase).toBe("opening");
    expect(after.hero.visibility).toBe("visible");
    expect(Math.abs(after.hero.width - before.width)).toBeLessThan(40);

    await finishEverything(page);
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
    await expectOneImageLeft(page);
  });

  test("view transitions keep the normal opening without a swipe", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=vt");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
    await expectOneImageLeft(page);
  });

  test("reduced motion stays a fade with no clone", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);
    await expect(viewer(page)).toHaveAttribute("data-engine", "fade");
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
    await expect(page.locator("[data-slot=ombra-image]").first()).toHaveCSS(
      "visibility",
      "visible",
    );
    await expectOneImageLeft(page);
  });

  test("a real touch drag down cuts a FLIP opening", async ({ page, context, browserName }) => {
    test.skip(
      browserName !== "chromium" || !test.info().project.name.includes("mobile"),
      "Needs CDP touch input",
    );

    await page.goto("/spike?engine=flip&slow=1");
    await page.waitForLoadState("networkidle");
    await freezeMorph(page, "flip");
    await page.locator("[data-slot=ombra-trigger]").first().tap();
    await page.waitForFunction(() => window.ombraFrozen === true);

    const cdp = await context.newCDPSession(page);
    const y = (page.viewportSize()?.height ?? 800) / 2;

    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 200, y }],
    });

    for (let step = 1; step <= 10; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 200, y: y + step * 15 }],
      });
    }

    await expect(viewer(page)).toHaveAttribute("data-phase", "closing");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await finishEverything(page);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expectOneImageLeft(page);
  });

  for (const engine of ["flip", "vt"] as const) {
    test(`a real touch swipe moves the photo: ${engine}`, async ({
      page,
      context,
      browserName,
    }) => {
      test.skip(
        browserName !== "chromium" || !test.info().project.name.includes("mobile"),
        "Needs CDP touch input",
      );

      await page.goto(`/spike?engine=${engine}&slow=1`);
      await page.waitForLoadState("networkidle");
      await freezeMorph(page, engine);
      await page.locator("[data-slot=ombra-trigger]").first().tap();
      await page.waitForFunction(() => window.ombraFrozen === true);

      const cdp = await context.newCDPSession(page);
      const y = (page.viewportSize()?.height ?? 800) / 2;

      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 320, y }],
      });

      for (let step = 1; step <= 10; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: 320 - step * 15, y }],
        });
      }

      await expect
        .poll(() => page.locator("[data-slot=ombra-track]").evaluate((track) => track.scrollLeft))
        .toBeGreaterThan(20);

      await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);

      const heroState = await page
        .locator("[data-slot=ombra-image]")
        .first()
        .evaluate((image) => ({
          visibility: getComputedStyle(image).visibility,
          name: image.style.viewTransitionName,
          animating: image.getAnimations().length,
        }));

      expect(heroState).toEqual({ visibility: "visible", name: "", animating: 1 });

      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await finishEverything(page);
      await expect(viewer(page)).toHaveAttribute("data-phase", "open");
      await expectOneImageLeft(page);
    });
  }
});
