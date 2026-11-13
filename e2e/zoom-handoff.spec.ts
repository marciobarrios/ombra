import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const firstPhoto = "Desert road through red rock toward a distant peak";
const STEP_PX = 20;

type TrackState = { scroll: number; layerX: number; active: number; zoomed: string | null };

/** Opens the first photo zoomed in and presses the mouse in the middle of the track. */
async function pressZoomed(page: Page) {
  await page.goto("/spike?engine=fade");
  await page.getByRole("button", { name: firstPhoto }).click();

  const viewer = page.locator("[data-slot=ombra-viewer]");

  await expect(viewer).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(viewer).toHaveAttribute("data-zoomed", "true");

  const box = await page.locator("[data-slot=ombra-track]").boundingBox();

  if (!box) throw new Error("track had no box");

  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.mouse.move(point.x, point.y);
  await page.mouse.down();

  return point;
}

function readTrack(page: Page): Promise<TrackState> {
  return page.evaluate(() => {
    const track = document.querySelector<HTMLElement>("[data-slot=ombra-track]");
    const slides = [...document.querySelectorAll<HTMLElement>("[data-slot=ombra-slide]")];
    const active = slides.findIndex((slide) => slide.dataset.active === "true");
    const layer = slides[active]?.querySelector<HTMLElement>("[data-slot=ombra-zoom]");

    return {
      scroll: track?.scrollLeft ?? Number.NaN,
      layerX: layer ? new DOMMatrix(getComputedStyle(layer).transform).e : Number.NaN,
      active,
      zoomed:
        document.querySelector("[data-slot=ombra-viewer]")?.getAttribute("data-zoomed") ?? null,
    };
  });
}

function nextFrame(page: Page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => resolve(undefined));
      }),
  );
}

/** Drags left one step at a time and returns the track state after each step. */
async function dragLeft(page: Page, from: { x: number; y: number }, start: number, steps: number) {
  const states: TrackState[] = [];

  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(from.x - (start + step) * STEP_PX, from.y);
    await nextFrame(page);
    states.push(await readTrack(page));
  }

  return states;
}

// MAR-104: past the edge of a zoomed photo the pan carries on into the track, like Photos.
test.describe("zoomed pan hand-off", () => {
  test("the track follows the finger past the photo's edge and pages on release", async ({
    page,
  }) => {
    const point = await pressZoomed(page);
    const states = await dragLeft(page, point, 0, 40);
    const handedOff = states.filter((state) => state.scroll > 0);

    expect(handedOff.length).toBeGreaterThan(10);

    // Once the photo stops at its edge, every step of the finger moves the track one step.
    for (let index = 1; index < handedOff.length; index += 1) {
      const moved = (handedOff[index]?.scroll ?? 0) - (handedOff[index - 1]?.scroll ?? 0);

      expect(Math.abs(moved - STEP_PX)).toBeLessThan(2);
    }

    // The photo keeps its zoom and the index holds while the finger is down.
    expect(states.at(-1)?.active).toBe(0);
    expect(states.at(-1)?.zoomed).toBe("true");

    await page.mouse.up();
    await expect.poll(async () => (await readTrack(page)).active).toBe(1);
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-zoomed", "false");

    const settled = await page.evaluate(() => {
      const track = document.querySelector<HTMLElement>("[data-slot=ombra-track]");
      const active = "[data-slot=ombra-slide][data-active=true]";
      const slide = document.querySelector<HTMLElement>(active);

      if (!track || !slide) return Number.NaN;

      const trackRect = track.getBoundingClientRect();
      const slideRect = slide.getBoundingClientRect();

      return slideRect.left + slideRect.width / 2 - (trackRect.left + trackRect.width / 2);
    });

    expect(Math.abs(settled)).toBeLessThan(2);
  });

  test("a short pan past the edge springs back to the same zoomed photo", async ({ page }) => {
    const point = await pressZoomed(page);
    const states = await dragLeft(page, point, 0, 40);
    const edge = states.findIndex((state) => state.scroll > 0);

    expect(edge).toBeGreaterThan(0);

    // Start again, stopping a few steps past the edge, then hold still before letting go.
    await page.mouse.move(point.x, point.y);
    await nextFrame(page);

    const home = await readTrack(page);

    expect(home.scroll).toBe(0);
    await dragLeft(page, point, 0, edge + 3);
    await page.waitForTimeout(150);
    await page.mouse.up();

    await expect.poll(async () => (await readTrack(page)).scroll).toBe(0);

    const after = await readTrack(page);

    expect(after.active).toBe(0);
    expect(after.zoomed).toBe("true");
  });

  test("reversing past the edge brings the track back before the photo pans", async ({ page }) => {
    const point = await pressZoomed(page);
    const forward = await dragLeft(page, point, 0, 30);
    const deepest = forward.at(-1);

    expect(deepest?.scroll ?? 0).toBeGreaterThan(100);

    // Back to the right by the same distance: the track returns first, then the photo.
    const back: TrackState[] = [];

    for (let step = 29; step >= 0; step -= 1) {
      await page.mouse.move(point.x - step * STEP_PX, point.y);
      await nextFrame(page);
      back.push(await readTrack(page));
    }

    const returning = back.findIndex((state) => state.scroll === 0);

    // While the track is still out, the photo stays pinned at its edge.
    for (const state of back.slice(0, returning)) {
      expect(state.layerX).toBeCloseTo(deepest?.layerX ?? 0, 0);
    }

    // Then the photo pans back to where the drag began.
    expect(back.at(-1)?.scroll).toBe(0);
    expect(back.at(-1)?.layerX ?? Number.NaN).toBeCloseTo(0, 0);
    await page.mouse.up();
  });
});
