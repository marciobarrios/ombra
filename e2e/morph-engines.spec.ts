import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    ombraFreeze?: (fraction: number) => void;
    ombraFrozen?: boolean;
    ombraVtCalls?: number;
    ombraFlights?: number;
  }
}

type Box = { x: number; y: number; width: number; height: number };

const firstPhoto = "Desert road through red rock toward a distant peak";

// A landscape photo in a portrait thumbnail: half of it is cropped away at the thumbnail.
const croppedPhoto = "Sunlit path through a dense green forest";

function viewer(page: Page) {
  return page.locator("[data-slot=ombra-viewer]");
}

/**
 * Installs `window.ombraFreeze(fraction)`, which waits for the next morph and pauses
 * it at that share of its duration. Only animations that start after the call count,
 * so a second freeze catches the close and not the opening it cut short.
 */
async function installFreezer(page: Page) {
  await page.addInitScript(() => {
    const ours = (animation: Animation) => {
      const effect = animation.effect;

      // The thumbnail strip's edge cues run on a scroll timeline, which has no time to set.
      if (!(effect instanceof KeyframeEffect) || animation.timeline !== document.timeline) {
        return false;
      }

      if (effect.pseudoElement?.startsWith("::view-transition")) return true;

      const target = effect.target;

      return (
        target instanceof Element &&
        target.closest(
          "[data-slot=ombra-flight], [data-slot=ombra-backdrop], [data-slot=ombra-viewer]",
        ) !== null
      );
    };

    const started = (animation: Animation) => {
      const effect = animation.effect;

      if (!(effect instanceof KeyframeEffect)) return false;

      if (effect.pseudoElement?.startsWith("::view-transition-group")) return true;

      return effect.target instanceof Element && effect.target.matches("[data-slot=ombra-flight]");
    };

    window.ombraFreeze = (fraction) => {
      const seen = new Set(document.getAnimations());

      window.ombraFrozen = false;

      const tick = () => {
        const fresh = document.getAnimations().filter((animation) => {
          return !seen.has(animation) && ours(animation);
        });

        if (!fresh.some(started)) {
          requestAnimationFrame(tick);

          return;
        }

        for (const animation of fresh) {
          const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);

          animation.pause();
          animation.currentTime = end * fraction;
        }

        window.ombraFrozen = true;
      };

      tick();
    };
  });
}

async function freeze(page: Page, fraction: number) {
  await page.evaluate((share) => window.ombraFreeze?.(share), fraction);
}

async function frozen(page: Page) {
  await page.waitForFunction(() => window.ombraFrozen === true);
}

async function thaw(page: Page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.playState === "paused") animation.play();
    }
  });
}

/** The photo's box on screen: the FLIP clone, or the view transition's group. */
async function photoBox(page: Page): Promise<Box | null> {
  return page.evaluate(() => {
    const flight = document.querySelector("[data-slot=ombra-flight]");

    if (flight) {
      const rect = flight.getBoundingClientRect();

      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }

    const style = getComputedStyle(
      document.documentElement,
      "::view-transition-group(ombra-shared)",
    );

    const width = Number.parseFloat(style.width);
    const height = Number.parseFloat(style.height);

    if (!(width > 0) || !(height > 0)) return null;

    const matrix = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);

    return { x: matrix.e, y: matrix.f, width: width * matrix.a, height: height * matrix.d };
  });
}

/** How strongly the viewer shows: the real backdrop, or the view transition's new root. */
async function scrim(page: Page): Promise<number> {
  return page.evaluate(() => {
    const transition = getComputedStyle(document.documentElement, "::view-transition-new(root)");
    const backdrop = document.querySelector("[data-slot=ombra-backdrop]");
    const live = Number.parseFloat(transition.opacity);

    if (document.documentElement.hasAttribute("data-ombra-morph") && live < 1) return live;

    return backdrop ? Number.parseFloat(getComputedStyle(backdrop).opacity) : 0;
  });
}

function expectSameBox(actual: Box | null, expected: Box | null, tolerance = 2) {
  expect(actual).not.toBeNull();
  expect(expected).not.toBeNull();

  if (!actual || !expected) return;

  expect(Math.abs(actual.x - expected.x)).toBeLessThan(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(tolerance);
  expect(Math.abs(actual.width - expected.width)).toBeLessThan(tolerance);
  expect(Math.abs(actual.height - expected.height)).toBeLessThan(tolerance);
}

async function supportsViewTransitions(page: Page) {
  return page.evaluate(() => "startViewTransition" in document);
}

/** Nothing a morph sets may outlive it. */
async function expectNoMorphLeft(page: Page) {
  await expect(viewer(page)).toBeHidden({ timeout: 8_000 });
  await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        morphing: document.documentElement.hasAttribute("data-ombra-morph"),
        pointerEvents: document.documentElement.style.getPropertyValue("--ombra-vt-pointer-events"),
        named: [...document.querySelectorAll<HTMLElement>("*")].filter(
          (element) => element.style.viewTransitionName !== "",
        ).length,
        hidden: [...document.querySelectorAll<HTMLElement>("[data-slot=ombra-trigger] img")].filter(
          (image) => image.style.visibility === "hidden",
        ).length,
      })),
    )
    .toEqual({ morphing: false, pointerEvents: "", named: 0, hidden: 0 });
}

test.describe("morph engines", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installFreezer(page);
  });

  test("defaults to FLIP without an engine in the query", async ({ page }) => {
    await page.goto("/spike");
    await expect(page.getByRole("radio", { name: "FLIP" })).toBeChecked();
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(viewer(page)).toHaveAttribute("data-engine", "flip");
  });

  for (const kind of ["open", "close"] as const) {
    test(`FLIP and View Transitions put the photo on the same pixels on ${kind}`, async ({
      page,
      browserName,
    }) => {
      // Under load, WebKit's computed group box sometimes lands far from the frame on
      // screen, so the comparison would test the measurement rather than the morph.
      test.skip(browserName === "webkit", "WebKit misreports the group box under load");
      await page.goto("/spike");
      test.skip(!(await supportsViewTransitions(page)));

      const boxes: Record<string, Array<Box | null>> = {};

      for (const engine of ["flip", "vt"]) {
        boxes[engine] = [];

        for (const fraction of [0.25, 0.5, 0.75]) {
          await page.goto(`/spike?engine=${engine}&slow=1`);

          if (kind === "close") {
            await page.getByRole("button", { name: croppedPhoto }).click();
            await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 8_000 });
          }

          await freeze(page, fraction);

          if (kind === "open") await page.getByRole("button", { name: croppedPhoto }).click();
          else await page.keyboard.press("Escape");

          await frozen(page);
          boxes[engine].push(await photoBox(page));
        }
      }

      for (const [at, flip] of (boxes.flip ?? []).entries()) {
        expectSameBox(flip, boxes.vt?.[at] ?? null);
      }
    });
  }

  test("an engine without View Transitions opens and closes with FLIP", async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(Document.prototype, "startViewTransition");
    });
    await page.goto("/spike?engine=vt&slow=1");
    await freeze(page, 0.5);
    await page.getByRole("button", { name: firstPhoto }).click();
    await frozen(page);
    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(1);
    await thaw(page);
    await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 8_000 });
    await freeze(page, 0.5);
    await page.keyboard.press("Escape");
    await frozen(page);
    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(1);
    await thaw(page);
    await expectNoMorphLeft(page);
    await expect(page.locator("[data-slot=ombra-trigger]").first()).toBeFocused();
  });

  for (const engine of ["flip", "vt", "fade"]) {
    test(`reduced motion only fades with ${engine}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(() => {
        window.ombraVtCalls = 0;
        window.ombraFlights = 0;

        const start = Document.prototype.startViewTransition;

        if (start instanceof Function) {
          Document.prototype.startViewTransition = function counted(
            ...args: Parameters<Document["startViewTransition"]>
          ) {
            window.ombraVtCalls = (window.ombraVtCalls ?? 0) + 1;

            return start.apply(this, args);
          };
        }

        new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (node instanceof HTMLElement && node.dataset.slot === "ombra-flight") {
                window.ombraFlights = (window.ombraFlights ?? 0) + 1;
              }
            }
          }
        }).observe(document, { childList: true, subtree: true });
      });
      await page.goto(`/spike?engine=${engine}`);
      await page.getByRole("button", { name: firstPhoto }).click();
      await expect(viewer(page)).toHaveAttribute("data-engine", "fade");
      await expect(viewer(page)).toHaveAttribute("data-phase", "open");
      await page.keyboard.press("Escape");
      await expectNoMorphLeft(page);

      const counts = await page.evaluate(() => ({
        transitions: window.ombraVtCalls,
        flights: window.ombraFlights,
      }));

      expect(counts).toEqual({ transitions: 0, flights: 0 });
    });
  }

  for (const engine of ["flip", "vt"]) {
    test(`a close during a ${engine} opening leaves from the current frame`, async ({ page }) => {
      await page.goto(`/spike?engine=${engine}&slow=1`);
      test.skip(engine === "vt" && !(await supportsViewTransitions(page)));

      await freeze(page, 0.4);
      await page.getByRole("button", { name: firstPhoto }).click();
      await frozen(page);

      const before = await photoBox(page);
      const scrimBefore = await scrim(page);

      expect(scrimBefore).toBeGreaterThan(0.05);
      expect(scrimBefore).toBeLessThan(0.95);

      await freeze(page, 0);
      await page.keyboard.press("Escape");
      await frozen(page);

      expectSameBox(await photoBox(page), before);
      expect(Math.abs((await scrim(page)) - scrimBefore)).toBeLessThan(0.05);

      await thaw(page);
      await expectNoMorphLeft(page);
    });
  }

  test("a view transition clears every other view-transition-name on the page", async ({
    page,
  }) => {
    await page.goto("/spike?engine=vt&slow=1");
    test.skip(!(await supportsViewTransitions(page)));

    await page.evaluate(() => {
      const heading = document.querySelector("h1");

      if (heading) heading.style.viewTransitionName = "page-heading";
    });
    await freeze(page, 0.5);
    await page.getByRole("button", { name: firstPhoto }).click();
    await frozen(page);

    const groups = await page.evaluate(() =>
      ["ombra-shared", "page-heading"].map(
        (name) =>
          Number.parseFloat(
            getComputedStyle(document.documentElement, `::view-transition-group(${name})`).width,
          ) > 0,
      ),
    );

    expect(groups).toEqual([true, false]);
    await thaw(page);
    await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 8_000 });
    await expect
      .poll(() =>
        page.evaluate(() => getComputedStyle(document.querySelector("h1")!).viewTransitionName),
      )
      .toBe("page-heading");
  });
});
