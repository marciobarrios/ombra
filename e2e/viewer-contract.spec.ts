import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// MAR-64: two behaviours of the composed viewer that other specs rely on without measuring.
// Opening locks the page without moving it, and a pull drives the sheet without React renders.

declare global {
  interface Window {
    ombraCommits?: () => number;
  }
}

const viewer = (page: Page) => page.locator("[data-slot=ombra-viewer]");

async function waitForOpen(page: Page) {
  await expect(viewer(page)).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
}

test("opening locks the page scroll without shifting its layout", async ({
  page,
  browserName,
  isMobile,
}) => {
  // A classic scrollbar takes layout width, so removing it would shift the page. Desktop
  // WebKit draws one for `::-webkit-scrollbar`; headless Chromium and the phones overlay theirs.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");

      style.textContent = "::-webkit-scrollbar { width: 15px; background: #ccc; }";
      document.head.append(style);
    });
  });
  await page.goto("/spike");
  await page.waitForLoadState("load");

  const layout = () =>
    page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollY: Math.round(window.scrollY),
      boxes: [...document.querySelectorAll("h1, [data-slot=ombra-trigger]")]
        .slice(0, 6)
        .map((node) => {
          const box = node.getBoundingClientRect();

          return [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 10));
        }),
    }));

  await expect.poll(async () => (await layout()).boxes.at(-1)?.[2] ?? 0).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo({ top: 240, behavior: "instant" }));
  await expect.poll(async () => (await layout()).scrollY).toBe(240);

  const before = await layout();

  if (browserName === "webkit" && !isMobile) {
    expect(before.width, "the page should have a classic scrollbar").toBeLessThan(
      await page.evaluate(() => window.innerWidth),
    );
  }

  // A press on the trigger's visible top, so Playwright does not scroll the rest into view.
  const trigger = await page.locator("[data-slot=ombra-trigger]").first().boundingBox();

  if (!trigger) throw new Error("The first trigger has no box.");
  await page.mouse.click(trigger.x + trigger.width / 2, trigger.y + 24);
  await waitForOpen(page);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");

  // WebKit's lock can report `scrollY` as 0 while the page stays put, so the boxes are the test.
  const open = await layout();

  expect(open.width).toBe(before.width);
  expect(open.boxes).toEqual(before.boxes);

  // The close may scroll its thumbnail into view, so only the width has to match afterwards.
  await page.keyboard.press("Escape");
  await expect(viewer(page)).toHaveCount(0);
  expect((await layout()).width).toBe(before.width);
});

test("a pull moves the sheet without a React commit per move", async ({ page }) => {
  // React reports every commit to the DevTools hook, production builds included.
  await page.addInitScript(() => {
    let commits = 0;

    Object.assign(window, {
      __REACT_DEVTOOLS_GLOBAL_HOOK__: {
        supportsFiber: true,
        isDisabled: false,
        renderers: new Map(),
        inject: () => 1,
        onCommitFiberRoot: () => {
          commits += 1;
        },
        onCommitFiberUnmount: () => {},
        onPostCommitFiberRoot: () => {},
        checkDCE: () => {},
      },
      ombraCommits: () => commits,
    });
  });
  await page.goto("/spike?engine=flip");
  await page.waitForLoadState("load");
  await expect.poll(() => page.evaluate(() => window.ombraCommits?.() ?? 0)).toBeGreaterThan(0);
  await page.locator("[data-slot=ombra-trigger]").first().click();
  await waitForOpen(page);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));

  const box = await page.locator("[data-slot=ombra-track]").boundingBox();

  if (!box) throw new Error("The track has no box.");

  const x = box.x + box.width / 2;
  const y = box.y + Math.min(72, box.height / 3);

  const pull = () =>
    page.evaluate(() =>
      Number(document.documentElement.style.getPropertyValue("--ombra-pull-live") || "0"),
    );

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 40, { steps: 4 });
  await expect(viewer(page)).toHaveAttribute("data-pulling", "true");

  const start = {
    commits: await page.evaluate(() => window.ombraCommits?.() ?? 0),
    pull: await pull(),
  };

  const moves = 30;

  for (let step = 1; step <= moves; step += 1) {
    await page.mouse.move(x, y + 40 + step * 5);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  }

  const end = {
    commits: await page.evaluate(() => window.ombraCommits?.() ?? 0),
    pull: await pull(),
  };

  expect(end.pull).toBeGreaterThan(start.pull);
  // The sheet followed every move through `--ombra-pull-live`. Thirty moves commit nothing;
  // the slack covers an unrelated commit, such as a photo that finishes decoding.
  expect(end.commits - start.commits).toBeLessThanOrEqual(1);

  await page.mouse.up();
});
