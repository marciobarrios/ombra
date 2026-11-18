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

  test("a disabled trigger and a cancelled press do not open", async ({ page }) => {
    const disabled = trigger(page, fourth.alt);

    await expect(disabled).toBeDisabled();
    await disabled.click({ force: true });

    await trigger(page, fifth.alt).click();
    await expect.poll(() => readout(page, "clicks")).toEqual(["cancel"]);
    await expect(dialog(page)).toHaveCount(0);
    expect(await readout(page, "open-asks")).toEqual([]);
    await expect(trigger(page, fifth.alt)).toHaveAttribute("aria-expanded", "false");
  });

  test("render, refs, handlers and custom media compose", async ({ page }) => {
    const custom = page.getByTestId("custom");

    await expect(custom).toHaveAttribute("data-custom-trigger", "true");
    await expect(custom).toHaveAttribute("data-slot", "ombra-trigger");
    await custom.click();
    await expect(dialog(page)).toBeVisible();
    await expect.poll(() => readout(page, "clicks")).toEqual(["render", "custom"]);

    await dialog(page).getByRole("button", { name: "Inspect sources" }).click();
    await expect(page.getByTestId("readout")).toHaveAttribute("data-refs", "true");
    // The default source is the trigger's image; a media ref replaces it.
    await expect(page.getByTestId("readout")).toHaveAttribute("data-sources", "img,media-ref");
  });

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

  test("a trigger that mounts with its item's selection owns the dialog", async ({ page }) => {
    await trigger(page, road.alt).click();

    for (let step = 0; step < 5; step += 1) {
      await dialog(page).getByRole("button", { name: "Next item" }).click();
    }

    await expect(dialog(page).getByTestId("active")).toHaveText(late.id);
    await expectOwner(page, trigger(page, late.alt));

    await close(page);
    await expect(trigger(page, late.alt)).toBeFocused();
  });

  test("without the current item's trigger, no trigger owns the dialog", async ({ page }) => {
    await trigger(page, road.alt).click();
    await dialog(page).getByRole("button", { name: "Remove current trigger" }).click();
    await expect(trigger(page, road.alt)).toHaveCount(0);
    await expect(page.locator("[data-slot=ombra-trigger][aria-expanded=true]")).toHaveCount(0);

    // Without a viewer, Base UI's default applies: focus goes back to the page, not to
    // another item's trigger. The gallery moves it to the nearest trigger instead.
    await close(page);
    await expect(page.locator("[data-slot=ombra-trigger]:focus")).toHaveCount(0);
  });
});

test.describe("gallery triggers", () => {
  const viewer = (page: Page) => page.locator("[data-slot=ombra-viewer]");
  const thumbnails = (page: Page) => page.locator("[data-slot=ombra-trigger]");

  test("one press starts one FLIP morph, and ownership follows navigation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await expect(thumbnails(page).first()).toHaveAttribute("aria-expanded", "false");

    // Count the clones the FLIP engine mounts: a second open request would mount another.
    await page.evaluate(() => {
      window.ombraFlights = 0;
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof HTMLElement && node.dataset.slot === "ombra-flight") {
              window.ombraFlights = (window.ombraFlights ?? 0) + 1;
            }
          }
        }
      }).observe(document.body, { childList: true });
    });

    await thumbnails(page).nth(1).click();
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
    expect(await page.evaluate(() => window.ombraFlights)).toBe(1);

    const id = await viewer(page).getAttribute("id");

    await expect(thumbnails(page).nth(1)).toHaveAttribute("aria-expanded", "true");
    await expect(thumbnails(page).nth(1)).toHaveAttribute("aria-controls", id ?? "");

    await page.keyboard.press("ArrowRight");
    await expect(thumbnails(page).nth(2)).toHaveAttribute("aria-expanded", "true");
    await expect(thumbnails(page).nth(1)).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("Escape");
    await expect(viewer(page)).toHaveCount(0);
    await expect(thumbnails(page).nth(2)).toBeFocused();
    await expect(page.locator("[data-slot=ombra-trigger][aria-expanded=true]")).toHaveCount(0);
  });

  test("a refused controlled open leaves no item, morph or trigger state", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike/root");

    const section = page.getByTestId("controlled");
    const target = section.locator("[data-slot=ombra-trigger]").nth(2);

    await page.waitForFunction(() => window.ombraHarness !== undefined);
    await page.evaluate(() =>
      window.ombraHarness?.dispatch({ type: "policy-changed", allowOpen: false }),
    );
    await target.click();

    await expect(page.getByTestId("controlled-readout")).toHaveAttribute(
      "data-open-asks",
      "[true]",
    );
    await expect(viewer(page)).toHaveCount(0);
    await expect(target).toHaveAttribute("aria-expanded", "false");
    await expect(target).not.toHaveAttribute("data-popup-open");
    // The thumbnail was never hidden for a morph that did not start.
    await expect(target.locator("img")).toHaveCSS("visibility", "visible");
    expect(await page.locator("[data-slot=ombra-flight]").count()).toBe(0);
  });
});

declare global {
  interface Window {
    ombraFlights?: number;
  }
}
