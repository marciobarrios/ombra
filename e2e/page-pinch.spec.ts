import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const engines = ["vt", "flip", "fade"] as const;

// Surfaces outside the image where a page pinch used to zoom the page (MAR-80).
const chrome = {
  toolbar: "[data-slot=ombra-viewer] header",
  caption: "[data-slot=ombra-caption]",
  thumbnails: "[data-slot=ombra-thumbnails]",
} as const;

function scale(page: Page) {
  return page.evaluate(() => window.visualViewport?.scale ?? 1);
}

async function center(locator: Locator) {
  const box = await locator.boundingBox();

  if (!box) throw new Error("The element has no bounds");

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A native two-finger pinch through Chromium's input pipeline, so touch-action applies. */
async function nativePinch(page: Page, point: { x: number; y: number }, scaleFactor = 2) {
  const session = await page.context().newCDPSession(page);

  await session.send("Input.synthesizePinchGesture", {
    ...point,
    scaleFactor,
    relativeSpeed: 800,
    gestureSourceType: "touch",
  });
  await session.detach();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

const NO_PAGE_PINCH =
  "This Chromium build does not pinch-zoom the page from synthetic touch (Linux CI); " +
  "the touch-action and gesture event checks still run";

/**
 * Skips unless this project can pinch-zoom the page natively. Synthetic touch pinch
 * zooms the page in macOS Chromium but not in the Linux CI build, so probe the plain
 * page first: a regression in the viewer cannot make this probe skip.
 */
async function requireNativePagePinch(page: Page, projectName: string) {
  test.skip(
    projectName !== "chromium-mobile",
    "Needs Chromium's native touch pinch; WebKit is covered by the gesture event test",
  );

  await page.goto("/spike");
  await nativePinch(page, { x: 100, y: 200 });

  const supported = (await scale(page)) > 1.2;

  test.skip(!supported, NO_PAGE_PINCH);
}

/** Dispatches Safari's gesture event and a ctrl+wheel; returns which defaults were cancelled. */
function pageZoomInputs(locator: Locator) {
  return locator.evaluate((node) => {
    const gesture = new UIEvent("gesturestart", { bubbles: true, cancelable: true });

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -40,
    });

    node.dispatchEvent(gesture);
    node.dispatchEvent(wheel);

    return { gesture: gesture.defaultPrevented, wheel: wheel.defaultPrevented };
  });
}

async function openViewer(page: Page, engine: string) {
  await page.goto(`/spike?engine=${engine}`);
  await page.locator("[data-slot=ombra-trigger]").nth(2).click();
  await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
}

async function closeViewer(page: Page) {
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("[data-slot=ombra-viewer]")).toBeHidden();
}

for (const engine of engines) {
  test(`blocks page pinch on viewer chrome and restores it after close with ${engine}`, async ({
    page,
  }) => {
    await openViewer(page, engine);

    const viewer = page.locator("[data-slot=ombra-viewer]");

    await expect(viewer).toHaveCSS("touch-action", "pan-x pan-y");
    await expect(page.locator("[data-slot=ombra-backdrop]")).toHaveCSS(
      "touch-action",
      "pan-x pan-y",
    );
    await expect(page.locator(chrome.toolbar)).toHaveCSS("touch-action", "none");
    await expect(page.locator(chrome.caption)).toHaveCSS("touch-action", "none");
    await expect(page.locator(chrome.thumbnails)).toHaveCSS("touch-action", "pan-x");
    await expect(page.locator("[data-slot=ombra-track]")).toHaveCSS("touch-action", "pan-x");

    for (const selector of [...Object.values(chrome), "[data-slot=ombra-backdrop]"]) {
      expect(await pageZoomInputs(page.locator(selector).first())).toEqual({
        gesture: true,
        wheel: true,
      });
    }

    await closeViewer(page);

    // Released on close: the page keeps its own pinch and ctrl+wheel zoom.
    expect(await pageZoomInputs(page.locator("[data-slot=ombra-trigger]").first())).toEqual({
      gesture: false,
      wheel: false,
    });

    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");

    expect(viewport).not.toMatch(/user-scalable=no|maximum-scale=1/);
  });

  test(`native pinch leaves the page scale at 1 inside the viewer with ${engine}`, async ({
    page,
  }, testInfo) => {
    await requireNativePagePinch(page, testInfo.project.name);
    await openViewer(page, engine);

    for (const selector of Object.values(chrome)) {
      await nativePinch(page, await center(page.locator(selector)));
      expect(await scale(page), selector).toBeCloseTo(1, 3);
    }

    // The image keeps its own pinch: the component zooms, the page does not.
    await nativePinch(page, await center(page.locator("[data-slot=ombra-track]")), 1.8);
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-zoomed", "true");
    expect(await scale(page)).toBeCloseTo(1, 3);
  });

  test(`native page pinch works again after close with ${engine}`, async ({ page }, testInfo) => {
    await requireNativePagePinch(page, testInfo.project.name);
    // A separate page: Chromium's synthetic pinch near the bottom strip can leave a
    // touch point unreleased, which would block every later synthetic pinch.
    await openViewer(page, engine);
    await nativePinch(page, await center(page.locator("[data-slot=ombra-track]")), 1.8);
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-zoomed", "true");
    await closeViewer(page);

    await nativePinch(page, { x: 100, y: 200 });
    await expect.poll(() => scale(page)).toBeGreaterThan(1.2);
  });

  test(`fits the visible area when the page was zoomed before opening with ${engine}`, async ({
    page,
  }, testInfo) => {
    await requireNativePagePinch(page, testInfo.project.name);
    await page.goto(`/spike?engine=${engine}`);

    const trigger = page.locator("[data-slot=ombra-trigger]").nth(2);

    await trigger.scrollIntoViewIfNeeded();
    await nativePinch(page, await center(trigger), 2);
    await expect.poll(() => scale(page)).toBeGreaterThan(1.5);
    // A plain tap: click() would scroll the visual viewport, and that scroll
    // event alone would refit the viewer and hide a missed fit on mount.
    const tap = await center(trigger);

    await page.touchscreen.tap(tap.x, tap.y);

    const viewer = page.locator("[data-slot=ombra-viewer]");

    await expect(viewer).toHaveAttribute("data-phase", "open");

    const fit = await viewer.evaluate((node) => {
      const visual = window.visualViewport;

      if (!visual) throw new Error("No visualViewport");

      const box = node.getBoundingClientRect();
      const close = node.querySelector("[data-slot=ombra-close]")?.getBoundingClientRect();

      return {
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        visual: {
          x: visual.offsetLeft,
          y: visual.offsetTop,
          width: visual.width,
          height: visual.height,
        },
        close: close ? { x: close.x, y: close.y, right: close.right, bottom: close.bottom } : null,
      };
    });

    expect(fit.box.x).toBeCloseTo(fit.visual.x, 0);
    expect(fit.box.y).toBeCloseTo(fit.visual.y, 0);
    expect(fit.box.width).toBeCloseTo(fit.visual.width, 0);
    expect(fit.box.height).toBeCloseTo(fit.visual.height, 0);
    expect(fit.close).not.toBeNull();
    expect(fit.close!.x).toBeGreaterThanOrEqual(fit.visual.x);
    expect(fit.close!.y).toBeGreaterThanOrEqual(fit.visual.y);
    expect(fit.close!.right).toBeLessThanOrEqual(fit.visual.x + fit.visual.width + 0.5);
    expect(fit.close!.bottom).toBeLessThanOrEqual(fit.visual.y + fit.visual.height + 0.5);

    // A plain tap: Playwright's click first scrolls the zoomed visual viewport.
    const close = await center(page.getByRole("button", { name: "Close", exact: true }));

    await page.touchscreen.tap(close.x, close.y);
    await expect(viewer).toBeHidden();
    expect(await scale(page)).toBeGreaterThan(1.5);
  });
}
