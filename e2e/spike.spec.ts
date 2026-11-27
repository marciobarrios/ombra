import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    ombraWheelSeen?: { prevented: number; events: number; pull: number };
    ombraWheelLog?: { t: number; prevented: boolean; viewer: boolean }[];
    ombraFirstFlight?: Promise<number>;
    ombraWheelCatch?: { before: number; after: number }[];
    ombraStreamGap?: number;
    ombraPullSeen?: { pulled: boolean; peak: number };
  }
}

const firstPhoto = "Desert road through red rock toward a distant peak";

test.describe("spike viewer", () => {
  test("keeps the track still while zoomed", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).click();

    const viewer = page.locator("[data-slot=ombra-viewer]");
    const track = page.locator("[data-slot=ombra-track]");

    await expect(viewer).toBeVisible();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(viewer).toHaveAttribute("data-zoomed", "true");

    const before = await track.evaluate((node) => node.scrollLeft);

    await track.dispatchEvent("wheel", { deltaX: 40, deltaY: 0, bubbles: true, cancelable: true });
    await expect.poll(async () => track.evaluate((node) => node.scrollLeft)).toBe(before);

    await page.keyboard.press("0");
    await expect(viewer).toHaveAttribute("data-zoomed", "false");
  });

  test("keeps the scrim and sheet where the pull released", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

    const track = page.locator("[data-slot=ombra-track]");
    const box = await track.boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + Math.min(72, box.height / 3);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 220, { steps: 10 });

    const before = await page.evaluate(() => {
      const backdrop = document.querySelector("[data-slot=ombra-backdrop]");
      const sheet = document.querySelector("[data-slot=ombra-sheet]");

      return {
        opacity: backdrop instanceof HTMLElement ? Number(getComputedStyle(backdrop).opacity) : 1,
        ty: sheet instanceof HTMLElement ? new DOMMatrix(getComputedStyle(sheet).transform).m42 : 0,
      };
    });

    expect(before.ty).toBeGreaterThan(24);
    expect(before.opacity).toBeLessThan(0.92);
    await page.mouse.up();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)));
        }),
    );

    const after = await page.evaluate(() => {
      const backdrop = document.querySelector("[data-slot=ombra-backdrop]");
      const sheet = document.querySelector("[data-slot=ombra-sheet]");

      return {
        opacity: backdrop instanceof HTMLElement ? Number(getComputedStyle(backdrop).opacity) : 1,
        ty: sheet instanceof HTMLElement ? new DOMMatrix(getComputedStyle(sheet).transform).m42 : 0,
      };
    });

    expect(after.opacity).toBeLessThan(before.opacity + 0.08);
    expect(after.ty).toBeGreaterThan(20);
  });

  test("an upward pull pushes the sheet up and dismisses", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

    const track = page.locator("[data-slot=ombra-track]");
    const box = await track.boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height - Math.min(72, box.height / 3);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 200, { steps: 10 });

    const pulled = await page.evaluate(() => {
      const backdrop = document.querySelector("[data-slot=ombra-backdrop]");
      const sheet = document.querySelector("[data-slot=ombra-sheet]");

      const matrix =
        sheet instanceof HTMLElement ? new DOMMatrix(getComputedStyle(sheet).transform) : null;

      return {
        progress: Number(document.documentElement.style.getPropertyValue("--ombra-pull-live")),
        opacity: backdrop instanceof HTMLElement ? Number(getComputedStyle(backdrop).opacity) : 1,
        ty: matrix?.m42 ?? 0,
        scale: matrix?.a ?? 1,
      };
    });

    expect(pulled.progress).toBeLessThan(-0.1);
    expect(pulled.ty).toBeLessThan(-24);
    // The sheet shrinks and the scrim fades by the size of the pull, whichever way it goes.
    expect(pulled.scale).toBeLessThan(1);
    expect(pulled.opacity).toBeLessThan(0.92);
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("a sideways mouse drag never pulls", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
    await watchPull(page);

    const box = await page.locator("[data-slot=ombra-track]").boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 200, y + 40, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const seen = await readPull(page);

    expect(seen.pulled).toBe(false);
    expect(seen.peak).toBe(0);
  });

  test.describe("trackpad", () => {
    test.skip(({ isMobile }) => isMobile, "a trackpad swipe is a desktop input");

    async function openAndHover(page: Page, query: string) {
      await page.goto(`/spike?${query}`);
      await page.getByRole("button", { name: firstPhoto }).click();
      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

      const box = await page.locator("[data-slot=ombra-track]").boundingBox();

      if (!box) throw new Error("track had no box");

      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }

    async function swipe(page: Page, deltaX: number, deltaY: number, events: number) {
      for (let step = 0; step < events; step += 1) {
        await page.mouse.wheel(deltaX, deltaY);
        await page.waitForTimeout(16);
      }
    }

    for (const [direction, deltaY] of [
      ["down", -40],
      ["up", 40],
    ] as const) {
      test(`a two-finger swipe ${direction} dismisses`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await openAndHover(page, "engine=flip");
        // Browse with the keys first: the browser then rings script focus until a pointer press.
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowLeft");
        await expect(page.locator("[data-slot=ombra-slide]").first()).toHaveAttribute(
          "data-active",
          "true",
        );
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)));
        await swipe(page, 0, deltaY, 8);
        await expect(page.getByRole("dialog")).toBeHidden();

        // Focus goes back to the photo without a keyboard ring: a swipe closed the viewer.
        const trigger = page.getByRole("button", { name: firstPhoto });

        await expect(trigger).toBeFocused();
        expect(await trigger.evaluate((node) => node.matches(":focus-visible"))).toBe(false);
      });
    }

    test("the photo follows the fingers and springs back after a short swipe", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await openAndHover(page, "engine=flip");

      // Short: under the distance threshold, and too short to count as a flick.
      await swipe(page, 0, -8, 3);

      // The snap-back animates the variable but leaves the inline value until it ends.
      const progress = await page.evaluate(() =>
        Number(document.documentElement.style.getPropertyValue("--ombra-pull-live")),
      );

      // Fingers moving down scroll with negative deltaY, and pull the photo down.
      expect(progress).toBeGreaterThan(0.01);
      await expect
        .poll(() =>
          page.evaluate(() =>
            Number(
              getComputedStyle(document.documentElement).getPropertyValue("--ombra-pull-live"),
            ),
          ),
        )
        .toBe(0);
      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute(
        "data-pulling",
        "false",
      );
      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    });

    /** Logs whether each wheel event was claimed, then sends `deltas` one by one. */
    async function sendLogged(page: Page, deltas: readonly number[], untilClosed = true) {
      await page.evaluate(() => {
        const log: { t: number; prevented: boolean; viewer: boolean }[] = [];

        window.ombraWheelLog = log;
        window.addEventListener("wheel", (event) => {
          log.push({
            t: event.timeStamp,
            prevented: event.defaultPrevented,
            viewer: document.querySelector("[data-slot=ombra-viewer]") !== null,
          });
        });
      });

      for (const delta of deltas) {
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(16);
      }

      if (!untilClosed) return [];

      await expect(page.getByRole("dialog")).toBeHidden();

      const log = await page.evaluate(() => window.ombraWheelLog ?? []);

      expect(log).toHaveLength(deltas.length);

      // A real trackpad sends every frame. Under a loaded test runner events can
      // arrive far apart, and a gap that long rightly ends the swallow on its own,
      // so a claim is only required of events that follow the previous one closely.
      return log.map((entry, index) => ({
        ...entry,
        unbroken: log.slice(1, index + 1).every((next, at) => next.t - log[at].t < 250),
      }));
    }

    // Past the threshold on the third event, then a tail that decays the way a trackpad's does.
    const close = [40, 40, 40, 40];
    const tail = [30, 22, 16, 11, 7, 4, 2];

    test("the swipe's momentum does not scroll the page after the close", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openAndHover(page, "engine=fade");

      const log = await sendLogged(page, [...close, ...tail]);

      expect(log.filter((entry) => entry.unbroken && !entry.prevented)).toEqual([]);
    });
  });
});

test.describe("touch pull", () => {
  test("a sideways swipe changes the photo and never starts a pull", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium" || !test.info().project.name.includes("mobile"),
      "Needs CDP touch input",
    );

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip");
    await page.getByRole("button", { name: firstPhoto }).tap();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
    await watchPull(page);

    const cdp = await context.newCDPSession(page);
    const box = await page.locator("[data-slot=ombra-track]").boundingBox();

    if (!box) throw new Error("track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    // Sideways with some vertical drift, as a real thumb swipe has.
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });

    for (let step = 1; step <= 8; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - step * 25, y: y + step * 6 }],
      });
    }

    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect(page.locator("[data-slot=ombra-slide][data-active=true]")).not.toHaveAttribute(
      "aria-label",
      /^1 of /,
    );
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const seen = await readPull(page);

    expect(seen.pulled).toBe(false);
    expect(seen.peak).toBe(0);
  });
});

/** Records, every frame, whether the viewer ever pulled and the largest pull it showed. */
async function watchPull(page: Page) {
  await page.evaluate(() => {
    const seen = { pulled: false, peak: 0 };

    window.ombraPullSeen = seen;

    const tick = () => {
      const viewer = document.querySelector("[data-slot=ombra-viewer]");

      const live = Number(
        getComputedStyle(document.documentElement).getPropertyValue("--ombra-pull-live") || "0",
      );

      if (viewer?.getAttribute("data-pulling") === "true") seen.pulled = true;

      seen.peak = Math.max(seen.peak, Math.abs(live));
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

async function readPull(page: Page) {
  const seen = await page.evaluate(() => window.ombraPullSeen);

  if (!seen) throw new Error("watchPull was not installed");

  return seen;
}
