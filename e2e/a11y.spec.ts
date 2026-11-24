import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

const count = photos.length;
const [first, second, third, , far] = photos;

if (!first || !second || !third || !far) {
  throw new Error("the spike gallery needs at least five photos");
}

/** One line per violation, so a failure names the rule and the node. */
function violationReport(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => JSON.stringify(node.target)).join("; ");

      return `${violation.id}: ${violation.help} [${targets}]`;
    })
    .join("\n");
}

async function settle(page: Page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.pause();
  });
}

async function expectNoViolations(page: Page, include: string) {
  const results = await new AxeBuilder({ page }).include(include).analyze();

  expect(results.violations, violationReport(results.violations)).toEqual([]);
}

/** Records each distinct text the live region shows from now on. */
async function watchLive(page: Page) {
  return page.evaluateHandle(() => {
    const node = document.querySelector("[data-slot=ombra-live]");

    if (!node) throw new Error("missing live region");

    const changes: string[] = [];

    const observer = new MutationObserver(() => {
      const next = (node.textContent ?? "").trim();

      if (changes.at(-1) !== next) changes.push(next);
    });

    observer.observe(node, { childList: true, characterData: true, subtree: true });

    return changes;
  });
}

async function focusRing(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true }).evaluate((node) => {
    const style = getComputedStyle(node);

    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      color: style.outlineColor,
    };
  });
}

test.describe("accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the open viewer has no axe violations in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/spike?engine=fade");
      await page.getByRole("button", { name: first.alt }).click();

      const dialog = page.getByRole("dialog", { name: first.alt });

      await expect(dialog).toBeVisible();
      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
      await expect(page.getByRole("status")).toContainText("1 of");
      await settle(page);
      await expectNoViolations(page, "[data-slot=ombra-viewer]");
    });

    test(`the gallery has no axe violations in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/spike?engine=fade");
      await expect(page.locator("[data-slot=ombra-trigger]").first()).toBeVisible();
      await settle(page);
      await expectNoViolations(page, "[data-slot=ombra-root]");
    });

    test(`the open album has no axe violations in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/spike/album");
      await page.locator("[data-slot=ombra-trigger]").click();
      await expect(page.locator("[data-slot=ombra-album]")).toHaveAttribute("data-phase", "open");
      await settle(page);
      await expectNoViolations(page, "[data-slot=ombra-album]");
    });

    // The docs highlight code with a theme pair; a theme change can drop a token below 4.5:1.
    for (const item of ["ombra", "ombra-morph", "ombra-zoom"]) {
      test(`the ${item} docs page has no axe violations in ${colorScheme} mode`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(`/docs/${item}`);
        await expect(page.locator("[data-agent-prompt]")).toBeVisible();
        await expectNoViolations(page, "main");
      });
    }
  }

  test("the open dialog names itself, traps focus, and escape returns focus", async ({ page }) => {
    await page.goto("/spike?engine=fade");

    const trigger = page.getByRole("button", { name: first.alt });

    await trigger.click();

    const dialog = page.getByRole("dialog", { name: first.alt });
    const close = dialog.getByRole("button", { name: "Close", exact: true });

    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    await expect(page.locator("main")).toHaveAttribute("aria-hidden", "true");

    const carousel = dialog.getByRole("region", { name: "Photographs" });
    const slide = dialog.getByRole("group");

    await expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
    await expect(slide).toHaveCount(1);
    await expect(slide).toHaveAttribute("aria-roledescription", "slide");
    await expect(slide).toHaveAccessibleName(`1 of ${count}`);
    await expect(dialog.getByRole("status")).toHaveText(`Image 1 of ${count}. ${first.caption}`);
    await expect(carousel).toMatchAriaSnapshot(`
      - region "Photographs":
        - status: /Image 1 of ${count}/
        - group "1 of ${count}":
          - img "${first.alt}"
    `);

    await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await expect(close).not.toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();

    const ring = await focusRing(page, "Close");

    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThan(0);

    // Shift+Tab from the first control wraps, and a long Tab walk never leaves the dialog.
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await expect(close).not.toBeFocused();

    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press("Tab");
      await expect(dialog.locator(":focus")).toHaveCount(1);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator("main")).not.toHaveAttribute("aria-hidden", "true");
  });

  test("arrow keys move the photo while the track is focused", async ({ page }) => {
    await page.goto("/spike?engine=fade");
    await page.getByRole("button", { name: first.alt }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const track = page.locator("[data-slot=ombra-track]");

    for (let step = 0; step < 8; step += 1) {
      if (await track.evaluate((node) => node === document.activeElement)) break;

      await page.keyboard.press("Tab");
    }

    await expect(track).toBeFocused();
    await expect
      .poll(() => track.evaluate((node) => getComputedStyle(node).outlineStyle))
      .not.toBe("none");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("status")).toContainText("2 of");
    await page.keyboard.press("Home");
    await expect(page.getByRole("status")).toContainText("1 of");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("button", { name: first.alt })).toBeFocused();
  });

  test("a slide change is announced once, including a jump across several slides", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=fade");
    await page.getByRole("button", { name: first.alt }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const dialog = page.getByRole("dialog");
    const live = page.getByRole("status");

    await expect(dialog).toHaveAccessibleName(first.alt);
    await expect(live).toHaveText(`Image 1 of ${count}. ${first.caption}`);

    const stepped = await watchLive(page);

    await page.keyboard.press("ArrowRight");
    await expect(live).toHaveText(`Image 2 of ${count}. ${second.caption}`);
    await page.keyboard.press("ArrowRight");
    await expect(dialog).toHaveAccessibleName(third.alt);
    await expect(live).toHaveText(`Image 3 of ${count}. ${third.caption}`);
    expect(await stepped.jsonValue()).toEqual([
      `Image 2 of ${count}. ${second.caption}`,
      `Image 3 of ${count}. ${third.caption}`,
    ]);

    const jumped = await watchLive(page);

    await dialog.getByRole("button", { name: far.alt }).click();
    await expect(live).toHaveText(`Image 5 of ${count}. ${far.caption}`);
    expect(await jumped.jsonValue()).toEqual([`Image 5 of ${count}. ${far.caption}`]);
  });

  test("reduced motion never moves the viewer through space", async ({ page }) => {
    // A string, so the prototype hooks stay out of the lint rules for typed source.
    await page.addInitScript(`(() => {
      const spatial = [];
      const scrolls = [];
      const moving = new Set(["transform", "left", "top", "right", "bottom", "clipPath", "clip-path", "translate", "scale", "rotate", "offset"]);
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, options) {
        const frames = Array.isArray(keyframes) ? keyframes : [keyframes];
        const props = new Set();
        for (const frame of frames) {
          if (frame && typeof frame === "object") {
            for (const key of Object.keys(frame)) props.add(key);
          }
        }
        const raw = typeof options === "number" ? options : options && options.duration;
        const duration = Number(raw || 0);
        if (duration > 0 && [...props].some((prop) => moving.has(prop))) {
          spatial.push({ props: [...props], duration });
        }
        return animate.call(this, keyframes, options);
      };
      const note = (options) => {
        if (options && typeof options === "object" && options.behavior) scrolls.push(String(options.behavior));
      };
      for (const method of ["scrollTo", "scrollBy", "scrollIntoView"]) {
        const original = Element.prototype[method];
        Element.prototype[method] = function (options) {
          note(options);
          return original.call(this, options);
        };
      }
      window.ombraMotion = { spatial, scrolls };
    })();`);

    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: first.alt }).click();

    const viewer = page.locator("[data-slot=ombra-viewer]");

    await expect(viewer).toHaveAttribute("data-phase", "open");
    await expect(viewer).toHaveAttribute("data-engine", "fade");
    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);

    const track = page.locator("[data-slot=ombra-track]");
    const before = await track.evaluate((node) => node.scrollLeft);

    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("status")).toContainText(`Image 2 of ${count}`);

    const after = await track.evaluate((node) => node.scrollLeft);

    expect(after).toBeGreaterThan(before);

    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(viewer).toHaveAttribute("data-zoomed", "true");

    const zoom = page.locator("[data-slot=ombra-slide][data-active=true] [data-slot=ombra-zoom]");
    const scale = await zoom.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a);

    expect(scale).toBeGreaterThan(1.1);
    await expect
      .poll(() =>
        zoom.evaluate((node) => node.getAnimations().map((animation) => animation.playState)),
      )
      .toEqual([]);

    const sheet = page.locator("[data-slot=ombra-sheet]");
    const rested = await sheet.boundingBox();

    if (!rested) throw new Error("the sheet had no box");

    const box = await track.boundingBox();

    if (!box) throw new Error("the track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();

    for (let step = 1; step <= 5; step += 1) {
      await page.mouse.move(x, y + step * 8);
      await page.waitForTimeout(20);
    }

    await expect(sheet).toHaveCSS("transform", "none");

    const pulled = await sheet.boundingBox();

    expect(pulled?.y).toBeCloseTo(rested.y, 0);
    await page.mouse.up();
    await expect(viewer).toHaveAttribute("data-phase", "open");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);

    const motion = await page.evaluate<{ spatial: unknown[]; scrolls: string[] }>(
      "window.ombraMotion",
    );

    expect(motion.spatial).toEqual([]);
    expect(motion.scrolls.filter((behavior) => behavior === "smooth")).toEqual([]);
  });

  test("forced colors keep a visible focus ring on the chrome", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "forced-colors emulation is Chromium's");

    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/spike?engine=fade");
    await page.getByRole("button", { name: first.alt }).click();

    const close = page.getByRole("button", { name: "Close", exact: true });

    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();

    const ring = await focusRing(page, "Close");

    expect(ring.style).toBe("solid");
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(ring.color).not.toBe("rgba(0, 0, 0, 0)");
  });
});
