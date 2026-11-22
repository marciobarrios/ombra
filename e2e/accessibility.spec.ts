import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

const count = photos.length;
const first = photos[0];
const third = photos[2];
const far = photos[4];

if (!first || !third || !far) throw new Error("the spike gallery needs at least five photos");

declare global {
  interface Window {
    __ombraSpatial?: { props: string[]; duration: number }[];
    __ombraScroll?: string[];
    __ombraLive?: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("the open dialog names itself, announces once, and traps focus", async ({ page }) => {
  await page.goto("/spike?engine=flip");

  const trigger = page.getByRole("button", { name: first.alt });

  await trigger.click();

  const dialog = page.getByRole("dialog", { name: first.alt });
  const close = dialog.getByRole("button", { name: "Close", exact: true });

  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  await expect(page.locator("main")).toHaveAttribute("aria-hidden", "true");

  const carousel = dialog.getByRole("region", { name: "Photographs" });

  await expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
  await expect(dialog.getByRole("group")).toHaveCount(1);
  await expect(dialog.getByRole("group")).toHaveAttribute("aria-roledescription", "slide");
  await expect(dialog.getByRole("group")).toHaveAccessibleName(`1 of ${count}`);
  await expect(dialog.getByRole("img", { name: first.alt })).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveText(`Image 1 of ${count}. ${first.caption}`);

  await expect(carousel).toMatchAriaSnapshot(`
    - region "Photographs":
      - status: /Image 1 of ${count}/
      - group "1 of ${count}":
        - img "${first.alt}"
  `);

  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();

  const ring = await close.evaluate((node) => {
    const style = getComputedStyle(node);

    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });

  expect(ring.style).not.toBe("none");
  expect(ring.width).toBeGreaterThan(0);

  for (let step = 0; step < 12; step += 1) await page.keyboard.press("Tab");

  await expect(dialog.locator(":focus")).toHaveCount(1);

  const violations = await new AxeBuilder({ page }).include("[data-slot=ombra-viewer]").analyze();

  expect(violations.violations.map(summarizeViolation)).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator("main")).not.toHaveAttribute("aria-hidden", "true");
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
  await watchLive(page);

  const second = photos[1];

  if (!second) throw new Error("the spike gallery needs a second photo");

  await page.keyboard.press("ArrowRight");
  await expect(live).toHaveText(`Image 2 of ${count}. ${second.caption}`);
  await page.keyboard.press("ArrowRight");
  await expect(dialog).toHaveAccessibleName(third.alt);
  await expect(live).toHaveText(`Image 3 of ${count}. ${third.caption}`);

  const stepped = await liveChanges(page);

  expect(stepped).toEqual([
    `Image 2 of ${count}. ${second.caption}`,
    `Image 3 of ${count}. ${third.caption}`,
  ]);

  await watchLive(page);
  await dialog.getByRole("button", { name: far.alt }).click();
  await expect(live).toHaveText(`Image 5 of ${count}. ${far.caption}`);
  await expect(await liveChanges(page)).toEqual([`Image 5 of ${count}. ${far.caption}`]);
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
    const scrollTo = Element.prototype.scrollTo;
    const scrollBy = Element.prototype.scrollBy;
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollTo = function (options) {
      note(options);
      return scrollTo.call(this, options);
    };
    Element.prototype.scrollBy = function (options) {
      note(options);
      return scrollBy.call(this, options);
    };
    Element.prototype.scrollIntoView = function (options) {
      note(options);
      return scrollIntoView.call(this, options);
    };
    window.__ombraSpatial = spatial;
    window.__ombraScroll = scrolls;
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

  const motion = await page.evaluate(() => ({
    spatial: window.__ombraSpatial ?? [],
    scrolls: window.__ombraScroll ?? [],
  }));

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

  const ring = await close.evaluate((node) => {
    const style = getComputedStyle(node);

    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      color: style.outlineColor,
    };
  });

  expect(ring.style).toBe("solid");
  expect(ring.width).toBeGreaterThanOrEqual(2);
  expect(ring.color).not.toBe("rgba(0, 0, 0, 0)");
});

function summarizeViolation(violation: { id: string; nodes: { target: unknown[] }[] }): string {
  const targets = violation.nodes.map((node) => node.target.join(" ")).join("; ");

  return `${violation.id}: ${targets}`;
}

async function watchLive(page: Page) {
  await page.evaluate(() => {
    const node = document.querySelector("[data-slot=ombra-live]");

    if (!node) throw new Error("missing live region");

    const changes: string[] = [];

    const observer = new MutationObserver(() => {
      const next = (node.textContent ?? "").trim();

      if (changes.at(-1) !== next) changes.push(next);
    });

    observer.observe(node, { childList: true, characterData: true, subtree: true });
    window.__ombraLive = changes;
  });
}

async function liveChanges(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__ombraLive ?? []);
}
