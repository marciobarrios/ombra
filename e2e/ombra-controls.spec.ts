import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

// MAR-142: the viewer's controls are parts. The /spike/controls bench labels them in Spanish,
// puts a text field and a scrolling panel in the viewer, and prevents End in its own handler.

const items = photos.slice(0, 5);
const first = items[0];

if (!first) throw new Error("The bench needs photos.");

const viewer = (page: Page) => page.locator("[data-slot=ombra-viewer]");
const counter = (page: Page) => page.locator("[data-slot=ombra-counter]");
const activeSlide = (page: Page) => page.locator("[data-slot=ombra-slide][data-active=true]");

async function openBench(page: Page, query = "") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/spike/controls${query}`);
  // A click before hydration does nothing.
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
}

test("the parts take the consumer's labels and counter format", async ({ page }) => {
  await openBench(page);

  const previous = page.getByRole("button", { name: "Foto anterior", exact: true });
  const next = page.getByRole("button", { name: "Foto siguiente", exact: true });

  await expect(counter(page)).toHaveText(`Foto 1 de ${items.length}`);
  await expect(counter(page)).toHaveAttribute("data-position", "1");
  await expect(counter(page)).toHaveAttribute("data-count", String(items.length));
  await expect(previous).toBeDisabled();
  await expect(previous).toHaveAttribute("data-slot", "ombra-previous");
  await expect(previous).toHaveAttribute("data-disabled", "");
  await expect(page.getByRole("button", { name: "Previous photo" })).toHaveCount(0);

  await next.click();
  await expect(counter(page)).toHaveText(`Foto 2 de ${items.length}`);
  await expect(previous).toBeEnabled();

  const thumbnails = page.locator("[data-slot=ombra-thumbnail]");

  await expect(thumbnails.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(thumbnails.nth(1)).toHaveAttribute("data-active", "true");
  await expect(thumbnails.nth(0)).toHaveAttribute("data-active", "false");

  await thumbnails.nth(items.length - 1).click();
  await expect(counter(page)).toHaveText(`Foto ${items.length} de ${items.length}`);
  await expect(next).toBeDisabled();
  await expect(thumbnails.nth(items.length - 1)).toHaveAttribute("aria-current", "true");
});

test("arrow keys, Home and End do nothing while focus is in a text input", async ({ page }) => {
  await openBench(page);
  await page.getByRole("button", { name: "Foto siguiente", exact: true }).click();
  await expect(counter(page)).toHaveText(`Foto 2 de ${items.length}`);

  const input = page.getByRole("textbox", { name: "Nota", exact: true });

  await input.fill("hola");
  await input.focus();

  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  // The caret moved instead of the viewer.
  await expect.poll(() => input.evaluate((node: HTMLInputElement) => node.selectionStart)).toBe(2);

  for (const key of ["ArrowRight", "Home", "End", "0", "+"]) {
    await page.keyboard.press(key);
  }

  await expect(counter(page)).toHaveText(`Foto 2 de ${items.length}`);
  await expect(activeSlide(page)).toHaveAttribute("aria-label", items[1]?.alt ?? "");
  // Typed, not zoomed. Where the caret went on Home and End depends on the platform.
  await expect(input).toHaveValue(/^(?=.*0)(?=.*\+).*hol/);
});

test("arrow keys leave a scrolling panel of the consumer's alone", async ({ page }) => {
  await openBench(page);
  await page.getByRole("button", { name: "Detalles", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("End");
  await expect(counter(page)).toHaveText(`Foto 1 de ${items.length}`);
});

test("browser and selection shortcuts stay with the browser", async ({ page }) => {
  await openBench(page);
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+End");
  await page.keyboard.press("ControlOrMeta+ArrowRight");
  await expect(counter(page)).toHaveText(`Foto 1 de ${items.length}`);

  await page.keyboard.press("ArrowRight");
  await expect(counter(page)).toHaveText(`Foto 2 de ${items.length}`);
});

test("a consumer onKeyDown that prevents End replaces the shortcut", async ({ page }) => {
  await openBench(page);
  await page.keyboard.press("End");
  await expect(counter(page)).toHaveText(`Foto 1 de ${items.length}`);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(counter(page)).toHaveText(`Foto 3 de ${items.length}`);
  await page.keyboard.press("Home");
  await expect(counter(page)).toHaveText(`Foto 1 de ${items.length}`);
});

test("leaving the controls out is a JSX change only", async ({ page }) => {
  await openBench(page, "?controls=none");

  for (const slot of ["previous", "next", "counter", "thumbnails", "thumbnail"]) {
    await expect(page.locator(`[data-slot=ombra-${slot}]`)).toHaveCount(0);
  }

  await page.keyboard.press("ArrowRight");
  await expect(activeSlide(page)).toHaveAttribute("aria-label", items[1]?.alt ?? "");
  await page.keyboard.press("End");
  // The bench's own handler still prevents End.
  await expect(activeSlide(page)).toHaveAttribute("aria-label", items[1]?.alt ?? "");
  await page.keyboard.press("Home");
  await expect(activeSlide(page)).toHaveAttribute("aria-label", first?.alt ?? "");
});
