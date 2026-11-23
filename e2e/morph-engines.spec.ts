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

const firstPhoto = "Desert road through red rock toward a distant peak";

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

  test("reduced motion fades even when FLIP is asked for", async ({ page }) => {
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
    await page.goto("/spike?engine=flip");
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
