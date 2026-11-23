import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

const [road, ridge, third, fourth, fifth, late] = photos;

if (!road || !ridge || !third || !fourth || !fifth || !late) {
  throw new Error("The bench needs six photos.");
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "Composed photos" });

/** By attribute, not role: a modal dialog hides the page's triggers from the accessibility tree. */
const trigger = (page: Page, name: string) =>
  page.locator(
    `[data-slot=ombra-trigger][aria-label="${name}"], [data-slot=ombra-trigger]:has(img[alt="${name}"])`,
  );

async function readout(page: Page, key: "open-asks" | "active-asks" | "clicks") {
  const value = await page.getByTestId("readout").getAttribute(`data-${key}`);

  // SAFETY: the bench writes these attributes with JSON.stringify of an array.
  return JSON.parse(value ?? "[]") as unknown[];
}

/** Base UI owns the disclosure attributes: the expanded trigger controls the rendered dialog. */
async function expectOwner(page: Page, owner: Locator) {
  const id = await dialog(page).getAttribute("id");

  expect(id).toBeTruthy();
  await expect(owner).toHaveAttribute("aria-expanded", "true");
  await expect(owner).toHaveAttribute("aria-controls", id ?? "");
  await expect(page.locator("[data-slot=ombra-trigger][aria-expanded=true]")).toHaveCount(1);
}

async function activate(page: Page, target: Locator, how: "click" | "tap" | "Enter" | "Space") {
  if (how === "click") return target.click();

  if (how === "tap") return target.tap();

  await target.focus();
  // Wait for focus before typing, so the key reaches the trigger and not the page.
  await expect(target).toBeFocused();
  await page.keyboard.press(how === "Space" ? " " : "Enter");
}

async function close(page: Page) {
  await dialog(page).getByRole("button", { name: "Close composed photos" }).click();
  await expect(dialog(page)).toHaveCount(0);
}

test.describe("OmbraTrigger", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/spike/trigger");
    // The triggers register in a layout effect after hydration.
    await expect(trigger(page, road.alt)).toHaveAttribute("aria-expanded", "false");
  });

  test("Base UI supplies the disclosure semantics for every trigger", async ({ page }) => {
    const all = page.locator("[data-slot=ombra-trigger]");

    await expect(all).toHaveCount(5);

    for (const element of await all.all()) {
      await expect(element).toHaveAttribute("aria-haspopup", "dialog");
      await expect(element).toHaveAttribute("aria-expanded", "false");
      await expect(element).toHaveAttribute("id", /.+/);
    }

    await trigger(page, ridge.alt).click();
    await expect(dialog(page)).toBeVisible();
    await expectOwner(page, trigger(page, ridge.alt));
    await expect(trigger(page, ridge.alt)).toHaveAttribute("data-popup-open", "");
  });

  for (const how of ["click", "tap", "Enter", "Space"] as const) {
    test(`${how} opens the trigger's own item once`, async ({ page, hasTouch }) => {
      test.skip(how === "tap" && !hasTouch, "Taps need a touch device.");

      await activate(page, trigger(page, third.alt), how);
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page).getByTestId("active")).toHaveText(third.id);
      await expect.poll(() => readout(page, "open-asks")).toEqual([true]);
      await expect.poll(() => readout(page, "active-asks")).toEqual([third.id]);
      await expectOwner(page, trigger(page, third.alt));
    });
  }

  test("ownership and focus return follow the current item", async ({ page }) => {
    await trigger(page, road.alt).click();
    await expectOwner(page, trigger(page, road.alt));

    await dialog(page).getByRole("button", { name: "Next item" }).click();
    await expect(dialog(page).getByTestId("active")).toHaveText(ridge.id);
    await expectOwner(page, trigger(page, ridge.alt));
    await expect(trigger(page, road.alt)).toHaveAttribute("aria-expanded", "false");

    await close(page);
    await expect(trigger(page, ridge.alt)).toBeFocused();
    await expect(page.locator("[data-slot=ombra-trigger][aria-expanded=true]")).toHaveCount(0);
  });
});

declare global {
  interface Window {
    ombraFlights?: number;
  }
}
