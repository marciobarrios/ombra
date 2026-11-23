import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

// MAR-25: the caption is the dialog description, the counter follows the active slide,
// and the chrome pads for the safe area. The tap toggle is covered in keyboard-controls.

const first = photos[0];
const second = photos[1];

if (!first || !second) throw new Error("The spike needs two photos.");

const viewer = (page: Page) => page.locator("[data-slot=ombra-viewer]");
const caption = (page: Page) => page.locator("[data-slot=ombra-caption]");
const counter = (page: Page) => page.locator("[data-slot=ombra-counter]");

type Box = { x: number; y: number; width: number; height: number };

function roundBox(box: Box): Box {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();

  if (!box) throw new Error("The element has no box.");

  return roundBox(box);
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function hydrated(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const trigger = document.querySelector("[data-slot=ombra-trigger]");

        return trigger ? Object.keys(trigger).some((key) => key.startsWith("__reactProps")) : false;
      }),
    )
    .toBe(true);
}

async function openGallery(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/spike?engine=fade");
  await hydrated(page);
  await page.getByRole("button", { name: first.alt, exact: true }).click();
  await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
  await expect(viewer(page)).toHaveAttribute("data-chrome", "shown");
}

test("caption and counter follow the active slide without moving the photo's frame", async ({
  page,
}) => {
  await openGallery(page);

  const track = page.locator("[data-slot=ombra-track]");
  const before = await boxOf(track);
  const captionHeight = (await boxOf(caption(page))).height;

  await expect(caption(page)).toHaveText(first.caption);
  await expect(counter(page)).toHaveText(`1 / ${photos.length}`);

  const dialog = page.getByRole("dialog");
  const describedBy = await dialog.getAttribute("aria-describedby");
  const captionId = await caption(page).getAttribute("id");

  expect(describedBy).toBeTruthy();
  expect(captionId).toBe(describedBy);

  await page.getByRole("button", { name: "Next photo", exact: true }).click();
  await expect(caption(page)).toHaveText(second.caption);
  await expect(counter(page)).toHaveText(`2 / ${photos.length}`);
  expect(await boxOf(track)).toEqual(before);
  expect((await boxOf(caption(page))).height).toBe(captionHeight);
});

test("safe-area padding clears the thumbnail strip", async ({ page }) => {
  await openGallery(page);

  const header = viewer(page).locator("header");
  const footer = viewer(page).locator("footer");
  const previous = viewer(page)
    .locator("[data-slot=ombra-chrome]:has(> [data-slot=ombra-nav])")
    .first();

  await expect(header).toHaveClass(/safe-area-inset-top/);
  await expect(header).toHaveClass(/safe-area-inset-left/);
  await expect(header).toHaveClass(/safe-area-inset-right/);
  await expect(footer).toHaveClass(/safe-area-inset-bottom/);
  await expect(footer).toHaveClass(/safe-area-inset-left/);
  await expect(footer).toHaveClass(/safe-area-inset-right/);
  await expect(previous).toHaveClass(/safe-area-inset-left/);

  const fit = await page.evaluate(() => {
    const footerNode = document.querySelector("[data-slot=ombra-viewer] footer");
    const headerNode = document.querySelector("[data-slot=ombra-viewer] header");
    const strip = document.querySelector("[data-slot=ombra-thumbnails]");
    const captionNode = document.querySelector("[data-slot=ombra-caption]");

    if (!footerNode || !headerNode || !strip || !captionNode) return null;

    const probe = document.createElement("div");

    probe.style.paddingTop = "max(0.75rem, env(safe-area-inset-top))";
    probe.style.paddingBottom = "max(0.75rem, env(safe-area-inset-bottom))";
    footerNode.append(probe);

    const probeStyle = getComputedStyle(probe);
    const footerBox = footerNode.getBoundingClientRect();
    const stripBox = strip.getBoundingClientRect();
    const captionBox = captionNode.getBoundingClientRect();

    const result = {
      headerMatchesInset: getComputedStyle(headerNode).paddingTop === probeStyle.paddingTop,
      footerMatchesInset: getComputedStyle(footerNode).paddingBottom === probeStyle.paddingBottom,
      captionAboveStrip: captionBox.bottom <= stripBox.top + 1,
      stripInsideFooter: stripBox.bottom <= footerBox.bottom + 1,
    };

    probe.remove();

    return result;
  });

  expect(fit).toEqual({
    headerMatchesInset: true,
    footerMatchesInset: true,
    captionAboveStrip: true,
    stripInsideFooter: true,
  });
});

test("a long caption is cut inside a stable box and a node stays the description", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/spike/chrome");
  await hydrated(page);
  await page.getByRole("button", { name: first.alt, exact: true }).click();
  await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 10_000 });

  const short = await caption(page).evaluate((node) => node.clientHeight);
  const frame = await boxOf(page.locator("[data-slot=ombra-track]"));

  await page.getByRole("button", { name: "Next photo", exact: true }).click();
  await expect(counter(page)).toHaveText("2 of 3");

  const long = await caption(page).evaluate((node) => ({
    client: node.clientHeight,
    clipped: node.scrollWidth > node.clientWidth + 8,
  }));

  expect(long.clipped).toBe(true);
  expect(long.client).toBe(short);
  expect(await boxOf(page.locator("[data-slot=ombra-track]"))).toEqual(frame);

  const captionBox = await boxOf(caption(page));
  const closeBox = await boxOf(page.getByRole("button", { name: "Close", exact: true }));
  const nextBox = await boxOf(page.getByRole("button", { name: "Next photo", exact: true }));
  const stripBox = await boxOf(page.locator("[data-slot=ombra-thumbnails]"));

  expect(overlaps(captionBox, closeBox)).toBe(false);
  expect(overlaps(captionBox, nextBox)).toBe(false);
  expect(overlaps(captionBox, stripBox)).toBe(false);
  expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(stripBox.y + 1);

  await page.getByRole("button", { name: "Next photo", exact: true }).click();
  await expect(counter(page)).toHaveText("3 of 3");
  await expect(caption(page).getByTestId("caption-credit")).toHaveText("Kyoto.");

  const describedBy = await page.getByRole("dialog").getAttribute("aria-describedby");

  await expect(caption(page)).toHaveAttribute("id", describedBy ?? "");
  await expect(caption(page)).toHaveClass(/tracking-wide/);
  expect(await boxOf(page.locator("[data-slot=ombra-track]"))).toEqual(frame);
});
