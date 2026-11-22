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

const media = (page: Page) =>
  page.locator("[data-slot=ombra-slide][data-active=true] [data-slot=ombra-media]");

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

test("ctrl and cmd plus and minus still belong to the browser", async ({ page }) => {
  await openViewer(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(() => publishedZoom(page)).toBeCloseTo(1.25, 2);

  const prevented = await page.evaluate(() => {
    const popup = document.querySelector("[data-slot=ombra-viewer]");

    if (!popup) throw new Error("The viewer is not open.");

    return ["+", "-", "=", "_"].flatMap((key) =>
      [true, false].map((ctrl) => {
        const event = new KeyboardEvent("keydown", {
          key,
          ctrlKey: ctrl,
          metaKey: !ctrl,
          bubbles: true,
          cancelable: true,
        });

        popup.dispatchEvent(event);

        return event.defaultPrevented;
      }),
    );
  });

  expect(prevented).toEqual([false, false, false, false, false, false, false, false]);
  await expect.poll(() => publishedZoom(page)).toBeCloseTo(1.25, 2);

  await page.keyboard.press("Control+Minus");
  await page.keyboard.press("Control+Equal");
  await expect.poll(() => publishedZoom(page)).toBeCloseTo(1.25, 2);
  await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");
});

test("a tap hides the chrome and the keyboard can still reach it", async ({ page }) => {
  await openViewer(page);

  await page.getByRole("button", { name: "Next photo", exact: true }).click();
  await expect(counter(page)).toHaveText(`2 / ${count}`);
  // The click is on a control, so the chrome stays. Wait out the tap window.
  await page.waitForTimeout(400);
  await expect(viewer(page)).toHaveAttribute("data-chrome", "shown");

  const before = await media(page).boundingBox();

  if (!before) throw new Error("The photo has no box.");

  await media(page).click();
  await expect(viewer(page)).toHaveAttribute("data-chrome", "hidden");

  const after = await media(page).boundingBox();

  expect(after?.x).toBeCloseTo(before.x, 0);
  expect(after?.y).toBeCloseTo(before.y, 0);
  expect(after?.width).toBeCloseTo(before.width, 0);
  expect(after?.height).toBeCloseTo(before.height, 0);

  const regions = page.locator("[data-slot=ombra-chrome]");

  await expect(regions).toHaveCount(4);

  for (const region of await regions.all()) {
    await expect(region).toHaveCSS("opacity", "0");
  }

  await expect(page.getByRole("button", { name: "Close", exact: true })).not.toHaveAttribute(
    "aria-hidden",
  );
  // A click can focus the track instead of the dialog. Either is inside the viewer.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const dialog = document.querySelector("[data-slot=ombra-viewer]");
        const active = document.activeElement;

        return Boolean(
          dialog && active instanceof Node && (dialog === active || dialog.contains(active)),
        );
      }),
    )
    .toBe(true);

  // The shortcuts do not depend on the controls being on screen.
  await page.keyboard.press("ArrowRight");
  await expect(counter(page)).toHaveText(`3 / ${count}`);

  await expect
    .poll(async () => {
      await page.keyboard.press("Tab");

      return page.locator("[data-slot=ombra-chrome]:focus-within").count();
    })
    .toBeGreaterThan(0);

  await expect(page.locator("[data-slot=ombra-chrome]:focus-within")).toHaveCSS("opacity", "1");

  const focused = page.locator(":focus");
  const box = await focused.boundingBox();

  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await media(page).click();
  await expect(viewer(page)).toHaveAttribute("data-chrome", "shown");

  for (const region of await regions.all()) {
    await expect(region).toHaveCSS("opacity", "1");
  }
});

test("a drag and a double-tap leave the chrome shown", async ({ page }) => {
  await openViewer(page);

  const box = await media(page).boundingBox();

  if (!box) throw new Error("The photo has no box.");

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Sideways, and past the tap slop, so it is a drag rather than a pull or a tap.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 40, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(viewer(page)).toHaveAttribute("data-chrome", "shown");
  await expect(viewer(page)).toHaveAttribute("data-phase", "open");

  await media(page).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const point = { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 };

    for (const pointerId of [81, 82]) {
      for (const type of ["pointerdown", "pointerup"] as const) {
        node.dispatchEvent(
          new PointerEvent(type, { bubbles: true, pointerType: "touch", pointerId, ...point }),
        );
      }
    }

    node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, ...point }));
  });

  await expect(viewer(page)).toHaveAttribute("data-zoomed", "true");
  await page.waitForTimeout(400);
  await expect(viewer(page)).toHaveAttribute("data-chrome", "shown");
});
