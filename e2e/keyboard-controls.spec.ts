import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

// MAR-19: every gesture has a key or a button, modifier shortcuts stay with the
// browser, and a tap hides the chrome without taking it out of the tab order.

const count = photos.length;
const first = photos[0];

if (!first) throw new Error("The bench needs photos.");

const viewer = (page: Page) => page.locator("[data-slot=ombra-viewer]");
const counter = (page: Page) => page.locator("[data-slot=ombra-counter]");

async function openViewer(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/spike?engine=fade");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const trigger = document.querySelector("[data-slot=ombra-trigger]");

        return trigger ? Object.keys(trigger).some((key) => key.startsWith("__reactProps")) : false;
      }),
    )
    .toBe(true);
  await page.getByRole("button", { name: first?.alt, exact: true }).click();
  await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
  await expect(viewer(page)).toHaveAttribute("data-chrome", "shown");
}

function publishedZoom(page: Page) {
  return viewer(page).evaluate((node) =>
    Number(getComputedStyle(node).getPropertyValue("--ombra-zoom")),
  );
}

const controls = ["Previous photo", "Next photo", "Close", "Zoom in", "Zoom out", "Reset zoom"];

test("keys and buttons move, zoom and close, and stop at the ends", async ({ page }) => {
  await openViewer(page);

  for (const name of controls) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();

    expect(box, name).not.toBeNull();
    expect(box?.width, name).toBeGreaterThanOrEqual(44);
    expect(box?.height, name).toBeGreaterThanOrEqual(44);
  }

  // Opening focuses Close programmatically, which does not show :focus-visible.
  // The track is also a tab stop. Keep tabbing until a control shows its ring.
  let label: string | null = null;

  for (let step = 0; step < 8; step += 1) {
    const focused = page.locator(":focus");
    const visible = await focused.evaluate((node) => node.matches(":focus-visible"));

    label = await focused.getAttribute("aria-label");

    if (visible && label && controls.includes(label)) break;

    await page.keyboard.press("Tab");
  }

  expect(controls).toContain(label);

  const ring = await page.locator(":focus").evaluate((node) => {
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();

    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      target: Math.min(box.width, box.height),
    };
  });

  expect(ring.style).not.toBe("none");
  expect(ring.width).toBeGreaterThanOrEqual(2);
  expect(ring.target).toBeGreaterThanOrEqual(44);

  await expect(page.getByRole("button", { name: "Previous photo", exact: true })).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(counter(page)).toHaveText(`1 / ${count}`);

  await page.keyboard.press("ArrowRight");
  await expect(counter(page)).toHaveText(`2 / ${count}`);
  await page.keyboard.press("Home");
  await expect(counter(page)).toHaveText(`1 / ${count}`);
  await page.getByRole("button", { name: "Next photo", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(counter(page)).toHaveText(`${count} / ${count}`);
  await expect(page.getByRole("button", { name: "Next photo", exact: true })).toBeDisabled();
  // Disabling Next must not drop focus on the page, or the zoom keys never arrive.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const dialog = document.querySelector("[role=dialog]");
        const active = document.activeElement;

        return Boolean(dialog && active && (dialog === active || dialog.contains(active)));
      }),
    )
    .toBe(true);
  await page.keyboard.press("ArrowRight");
  await expect(counter(page)).toHaveText(`${count} / ${count}`);
  await page.keyboard.press("Home");
  await page.keyboard.press("=");
  await page.keyboard.press("+");
  await expect.poll(() => publishedZoom(page)).toBeCloseTo(1.25 * 1.25, 2);
  await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");
  await page.keyboard.press("-");
  await expect.poll(() => publishedZoom(page)).toBeCloseTo(1.25, 2);
  await page.keyboard.press("0");
  await expect.poll(() => publishedZoom(page)).toBe(1);
  await expect(page.getByRole("button", { name: "Reset zoom", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(() => publishedZoom(page)).toBeCloseTo(1.25, 2);
  await page.getByRole("button", { name: "Reset zoom", exact: true }).click();
  await expect.poll(() => publishedZoom(page)).toBe(1);
  await expect(viewer(page)).toHaveAttribute("data-zoomed", "false");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
