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

declare global {
  interface Window {
    vtProbe?: { transitions: number; running: boolean; phases: string[] };
  }
}

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

  test("controlled: removing the active item asks the parent for its neighbour", async ({
    page,
  }) => {
    await openFrom(page, "controlled", first.alt);

    // The neighbour of the first item is the new first item.
    await harness(page, { type: "item-removed", section: "controlled", itemId: first.id });
    await expectActive(page, second.alt, "1 / 4");
    await expect(page.getByTestId("controlled-readout")).toHaveAttribute("data-active", second.id);

    await page.keyboard.press("ArrowRight");
    await expectActive(page, third.alt, "2 / 4");

    // A middle item hands over to the next one, not to the start.
    await harness(page, { type: "item-removed", section: "controlled", itemId: third.id });
    await expectActive(page, fourth.alt, "2 / 3");
    await expect(page.getByTestId("controlled-readout")).toHaveAttribute("data-active", fourth.id);
  });

  test("controlled: emptying the collection while a close is refused asks once", async ({
    page,
  }) => {
    const errors: string[] = [];

    page.on("pageerror", (error) => errors.push(error.message));
    await openFrom(page, "controlled", first.alt);
    await harness(page, { type: "policy-changed", allowClose: false });
    await harness(page, { type: "items-cleared", section: "controlled" });

    await expect.poll(() => asks(page, "controlled-readout", "open")).toEqual([true, false]);
    await page.waitForTimeout(300);
    expect(await asks(page, "controlled-readout", "open")).toEqual([true, false]);
    expect(errors).toEqual([]);
  });

  test("controlled open: a refused request does not linger for the parent's next open", async ({
    page,
  }) => {
    await harness(page, { type: "policy-changed", allowOpen: false });
    await page.getByTestId("open-only").getByRole("button", { name: fourth.alt }).click();
    await expect.poll(() => asks(page, "open-only-readout", "open")).toEqual([true]);
    await expect(viewer(page)).toHaveCount(0);

    // The parent opens on its own once the request has lapsed: that is the current item,
    // not the refused one.
    await page.waitForTimeout(1_200);
    await harness(page, { type: "parent-opened", section: "openOnly" });
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
    await expectActive(page, first.alt, "1 / 5");
  });

  test("a parent that answers later still opens the item it accepted", async ({ page }) => {
    await page.getByTestId("active-only").getByRole("button", { name: third.alt }).click();
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
    await expectActive(page, third.alt, "3 / 5");
    await expect(page.getByTestId("active-only-readout")).toHaveAttribute("data-active", third.id);
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

  test("controlled: a close that arrives during a View Transition opening closes once", async ({
    page,
  }) => {
    test.skip(
      !(await page.evaluate(() => "startViewTransition" in document)),
      "this browser has no View Transition API, so the opening runs FLIP",
    );

    // Counts the transitions and records every phase the viewer passes through.
    await page.evaluate(() => {
      const start = document.startViewTransition;
      const phases: string[] = [];
      const probe = { transitions: 0, running: false, phases };

      window.vtProbe = probe;
      document.startViewTransition = function (this: Document, ...args) {
        const transition = start.apply(this, args);

        probe.transitions += 1;
        probe.running = true;
        void transition.finished.finally(() => {
          probe.running = false;
        });

        return transition;
      };

      new MutationObserver(() => {
        const phase =
          document.querySelector("[data-slot=ombra-viewer]")?.getAttribute("data-phase") ??
          "unmounted";

        if (probe.phases.at(-1) !== phase) probe.phases.push(phase);
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-phase"],
      });
    });

    await page.getByTestId("vt").scrollIntoViewIfNeeded();
    await page.getByTestId("vt").getByRole("button", { name: first.alt, exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.vtProbe?.running)).toBe(true);

    expect(await page.evaluate(() => window.vtProbe?.transitions)).toBe(1);
    await harness(page, { type: "parent-closed", section: "vt" });
    await expect(viewer(page)).toHaveCount(0, { timeout: 10_000 });
    await page.waitForTimeout(600);

    const probe = await page.evaluate(() => window.vtProbe);

    // One close: a FLIP close from the opening's live frame ("closing"), or, when the close
    // lands before the transition has a frame to hand over, a view transition close.
    const flipCloses = probe?.phases.filter((phase) => phase === "closing").length ?? 0;
    const transitionCloses = (probe?.transitions ?? 0) - 1;

    expect(flipCloses + transitionCloses).toBe(1);
    expect(probe?.phases.at(-1)).toBe("unmounted");
    expect(probe?.phases).not.toContain("open");
    await expect(viewer(page)).toHaveCount(0);
    await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);
    expect(await asks(page, "vt-readout", "open")).toEqual([true]);
  });

  test("controlled: a refused swipe-down close puts the sheet back at rest", async ({ page }) => {
    await openFrom(page, "controlled", first.alt);
    await harness(page, { type: "policy-changed", allowClose: false });

    const box = await viewer(page).locator("[data-slot=ombra-track]").boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + Math.min(72, box.height / 3);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 220, { steps: 10 });

    const sheetOffset = () =>
      page.evaluate(() => {
        const sheet = document.querySelector("[data-slot=ombra-sheet]");

        return sheet instanceof HTMLElement
          ? new DOMMatrix(getComputedStyle(sheet).transform).m42
          : Number.NaN;
      });

    expect(await sheetOffset()).toBeGreaterThan(24);
    await page.mouse.up();

    await expect.poll(() => asks(page, "controlled-readout", "open")).toEqual([true, false]);
    await expect(viewer(page)).toHaveAttribute("data-phase", "open");
    await expect.poll(sheetOffset).toBe(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--ombra-pull-live").trim(),
        ),
      )
      .toBe("0");
    await expect(viewer(page)).toHaveAttribute("data-pulling", "false");
    await expectActive(page, first.alt, "1 / 5");
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
