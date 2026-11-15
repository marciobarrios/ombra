import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { HarnessAction } from "../apps/docs/app/spike/root/harness-actions";
import { photos } from "../apps/docs/app/spike/photos";

const items = photos.slice(0, 5);

function photo(at: number) {
  const item = items[at];

  if (!item) throw new Error(`The bench has no photo ${at}.`);

  return item;
}

const [first, second, third, fourth, fifth] = [0, 1, 2, 3, 4].map(photo);

const viewer = (page: Page) => page.locator("[data-slot=ombra-viewer]");

async function harness(page: Page, action: HarnessAction) {
  // The bench installs its handle after hydration, which can land after the load event.
  await page.waitForFunction(() => window.ombraHarness !== undefined);
  await page.evaluate((next) => window.ombraHarness?.dispatch(next), action);
}

async function openFrom(page: Page, section: string, alt: string) {
  await page.getByTestId(section).getByRole("button", { name: alt, exact: true }).click();
  await expect(viewer(page)).toHaveAttribute("data-phase", "open");
}

/** The viewer's accessible title is the active photo's alt text. */
async function expectActive(page: Page, alt: string, position: string) {
  await expect(viewer(page).getByRole("heading")).toHaveText(alt);
  await expect(viewer(page).locator("[data-slot=ombra-counter]")).toHaveText(position);
  // The active slide sits centred in the track, not just marked active.
  await expect
    .poll(() =>
      viewer(page)
        .locator("[data-slot=ombra-slide][data-active=true]")
        .evaluate((slide) => {
          const track = slide.closest("[data-slot=ombra-track]")!.getBoundingClientRect();
          const box = slide.getBoundingClientRect();

          return Math.abs(box.left + box.width / 2 - (track.left + track.width / 2));
        }),
    )
    .toBeLessThan(2);
}

async function asks(page: Page, readout: string, kind: "open" | "active") {
  const value = await page.getByTestId(readout).getAttribute(`data-${kind}-asks`);

  // SAFETY: the bench writes these attributes with JSON.stringify of an array.
  return JSON.parse(value ?? "[]") as unknown[];
}

test.describe("OmbraRoot", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike/root");
  });

  test("an empty collection does not open, even when asked to", async ({ page }) => {
    await expect(page.getByTestId("free").getByRole("button").first()).toBeVisible();
    await expect(viewer(page)).toHaveCount(0);
  });

  test("uncontrolled: a trigger opens its own item and reports it", async ({ page }) => {
    await openFrom(page, "free", fourth.alt);
    await expectActive(page, fourth.alt, "4 / 5");

    expect(await asks(page, "free-readout", "open")).toEqual([true]);
    expect(await asks(page, "free-readout", "active")).toEqual([fourth.id]);

    await page.keyboard.press("ArrowRight");
    await expectActive(page, fifth.alt, "5 / 5");
    await expect.poll(() => asks(page, "free-readout", "active")).toContain(fifth.id);

    await page.keyboard.press("Escape");
    await expect(viewer(page)).toHaveCount(0);
    expect(await asks(page, "free-readout", "open")).toEqual([true, false]);
  });

  test("the open item survives a reorder of the collection", async ({ page }) => {
    await openFrom(page, "free", second.alt);
    await expectActive(page, second.alt, "2 / 5");

    await harness(page, { type: "items-reversed", section: "free" });
    await expectActive(page, second.alt, "4 / 5");
  });

  test("removing the active item selects a neighbour, and closes when none remain", async ({
    page,
  }) => {
    await openFrom(page, "free", third.alt);

    await harness(page, { type: "item-removed", section: "free", itemId: third.id });
    await expectActive(page, fourth.alt, "3 / 4");

    await harness(page, { type: "item-removed", section: "free", itemId: fifth.id });
    await harness(page, { type: "item-removed", section: "free", itemId: fourth.id });
    await expectActive(page, second.alt, "2 / 2");

    await harness(page, { type: "items-cleared", section: "free" });
    await expect(viewer(page)).toHaveCount(0);
  });

  test("controlled: a refused open leaves the viewer closed", async ({ page }) => {
    await harness(page, { type: "policy-changed", allowOpen: false });
    await page.getByTestId("controlled").getByRole("button", { name: third.alt }).click();

    await expect.poll(() => asks(page, "controlled-readout", "open")).toEqual([true]);
    await expect(page.getByTestId("controlled-readout")).toHaveAttribute("data-open", "false");
    await expect(viewer(page)).toHaveCount(0);

    // Nothing was left pending: allowing it later does not open by itself.
    await harness(page, { type: "policy-changed", allowOpen: true });
    await expect(viewer(page)).toHaveCount(0);

    await openFrom(page, "controlled", third.alt);
    await expectActive(page, third.alt, "3 / 5");
  });

  test("controlled: the parent opens, navigates, and closes the viewer", async ({ page }) => {
    await harness(page, { type: "parent-opened", activeId: fourth.id });
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
    await expectActive(page, fourth.alt, "4 / 5");

    await harness(page, { type: "parent-selected", activeId: first.id });
    await expectActive(page, first.alt, "1 / 5");

    await harness(page, { type: "parent-closed" });
    await expect(viewer(page)).toHaveCount(0);
  });

  test("controlled: a refused navigation keeps the active item", async ({ page }) => {
    await openFrom(page, "controlled", second.alt);
    await harness(page, { type: "policy-changed", allowActive: false });

    await page.keyboard.press("End");
    await expect.poll(() => asks(page, "controlled-readout", "active")).toContain(fifth.id);
    await expectActive(page, second.alt, "2 / 5");

    await harness(page, { type: "policy-changed", allowActive: true });
    await page.keyboard.press("End");
    await expectActive(page, fifth.alt, "5 / 5");
    await expect(page.getByTestId("controlled-readout")).toHaveAttribute("data-active", fifth.id);
  });

  test("controlled: a refused close keeps the viewer open", async ({ page }) => {
    await openFrom(page, "controlled", first.alt);
    await harness(page, { type: "policy-changed", allowClose: false });

    await page.keyboard.press("Escape");
    await expect.poll(() => asks(page, "controlled-readout", "open")).toEqual([true, false]);
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");

    await harness(page, { type: "policy-changed", allowClose: true });
    await page.keyboard.press("Escape");
    await expect(viewer(page)).toHaveCount(0);
    await expect(page.getByTestId("controlled-readout")).toHaveAttribute("data-open", "false");
  });

  test("several roots on one page keep their own state", async ({ page }) => {
    await openFrom(page, "free", fifth.alt);
    await expect(viewer(page)).toHaveCount(1);
    await expect(page.getByTestId("controlled-readout")).toHaveAttribute("data-open", "false");
    expect(await asks(page, "controlled-readout", "open")).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(viewer(page)).toHaveCount(0);

    // The same photo IDs in the other root open their own viewer, on their own item.
    await openFrom(page, "controlled", fifth.alt);
    await expectActive(page, fifth.alt, "5 / 5");
    expect(await asks(page, "free-readout", "open")).toEqual([true, false]);
  });
});
