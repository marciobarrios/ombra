import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";
import {
  ANIMATED_PROPERTY_NAMES,
  CHROMIUM_FRAME_CEILING_MS,
  INP_LIMIT_MS,
} from "../tools/budget/limits.ts";

const firstPhoto = "Desert road through red rock toward a distant peak";
const photoCount = photos.length;

type FrameSample = { t: number; dt: number };

type TimedDuration = { t: number; duration: number; name?: string };

type FrameWindow = { longest: number; count: number };

declare global {
  interface Window {
    __ombraBudget?: {
      samples: FrameSample[];
      longFrames: TimedDuration[];
      interactions: TimedDuration[];
    };
  }
}

test("the performance report renders the budget", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Performance budget" }).click();
  await expect(page).toHaveURL(/\/performance$/);
  await expect(page.getByRole("heading", { name: "Performance budget" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("27 KB");
  await page.getByRole("link", { name: "Open the morph spike" }).click();
  await expect(page).toHaveURL(/\/spike$/);
  await expect(page.getByRole("heading", { name: "A shadow of the picture." })).toBeVisible();
  await page.getByRole("link", { name: "performance budget" }).click();
  await expect(page).toHaveURL(/\/performance$/);
});

test("Chromium flags a long frame, a slow interaction, or a new animated property", async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== "chromium" || testInfo.project.name !== "chromium",
    "Long-animation-frame is measured once, in desktop Chromium",
  );
  test.setTimeout(60_000);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/spike?engine=flip");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const trigger = document.querySelector("[data-slot=ombra-trigger]");

        return trigger ? Object.keys(trigger).some((key) => key.startsWith("__reactProps")) : false;
      }),
    )
    .toBe(true);

  const supported = await page.evaluate(() => [...PerformanceObserver.supportedEntryTypes]);

  expect(supported).toContain("long-animation-frame");
  expect(supported).toContain("event");

  await page.evaluate(() => {
    const samples: FrameSample[] = [];
    const longFrames: TimedDuration[] = [];
    const interactions: TimedDuration[] = [];
    let last: number | null = null;

    const loop = (now: number) => {
      if (last !== null) samples.push({ t: now, dt: now - last });

      last = now;
      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);

    const frames = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longFrames.push({ t: entry.startTime, duration: entry.duration });
      }
    });

    // SAFETY: the DOM lib has no long-animation-frame entry type. The string is that type at runtime.
    frames.observe({ type: "long-animation-frame" as "event", buffered: true });

    const events = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!("interactionId" in entry) || entry.interactionId === 0) continue;

        interactions.push({ t: entry.startTime, duration: entry.duration, name: entry.name });
      }
    });

    // SAFETY: event timing accepts durationThreshold. This project's PerformanceObserverInit omits it.
    events.observe({
      type: "event",
      durationThreshold: 16,
      buffered: true,
    } as PerformanceObserverInit);
    window.__ombraBudget = { samples, longFrames, interactions };
  });

  const viewer = page.locator("[data-slot=ombra-viewer]");
  const open = page.getByRole("button", { name: firstPhoto });

  await open.click();
  await expect(viewer).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  const seen = new Set<string>();
  const spans: { name: string; start: number; end: number }[] = [];

  async function rememberProperties() {
    const found = await page.evaluate(() => {
      const props = new Set<string>();
      const skip = new Set(["offset", "computedOffset", "easing", "composite"]);

      for (const animation of document.getAnimations()) {
        const effect = animation.effect;

        if (!(effect instanceof KeyframeEffect) || !effect.target) continue;

        const target = effect.target;

        const owned =
          target === document.documentElement ||
          (target instanceof Element &&
            target.closest(
              "[data-slot=ombra-viewer], [data-slot=ombra-flight], [data-slot=ombra-backdrop], [data-slot=ombra-popup], [data-slot=ombra-sheet]",
            ) !== null);

        if (!owned) continue;

        for (const frame of effect.getKeyframes()) {
          for (const key of Object.keys(frame)) {
            if (!skip.has(key)) props.add(key);
          }
        }
      }

      return [...props];
    });

    for (const prop of found) seen.add(prop);
  }

  async function span(name: string, action: () => Promise<void>) {
    const start = await page.evaluate(() => performance.now());

    await action();

    const end = await page.evaluate(() => performance.now());

    spans.push({ name, start, end });
  }

  await span("open", async () => {
    await open.click();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await rememberProperties();
    await expect(viewer).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
  });

  await span("navigation", async () => {
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText(`2 / ${photoCount}`);
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
  });

  await span("pinch", async () => {
    await pinch(page.locator("[data-slot=ombra-slide][data-active=true] [data-slot=ombra-media]"));
    await rememberProperties();
    await expect(viewer).toHaveAttribute("data-zoomed", "true");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)));
  });

  await span("pan", async () => {
    const box = await page.locator("[data-slot=ombra-track]").boundingBox();

    if (!box) throw new Error("The track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();

    for (let step = 1; step <= 4; step += 1) {
      await page.mouse.move(x + step * 12, y);
      await page.waitForTimeout(20);
    }

    await page.mouse.up();
    await rememberProperties();
    await expect(viewer).toHaveAttribute("data-phase", "open");
  });

  await page.keyboard.press("0");
  await expect(viewer).toHaveAttribute("data-zoomed", "false");

  await span("pull", async () => {
    const box = await page.locator("[data-slot=ombra-track]").boundingBox();

    if (!box) throw new Error("The track had no box");

    const x = box.x + box.width / 2;
    const y = box.y + Math.min(72, box.height / 3);

    await page.mouse.move(x, y);
    await page.mouse.down();

    for (let step = 1; step <= 7; step += 1) {
      await page.mouse.move(x, y + step * 10);
      await page.waitForTimeout(20);
    }

    const live = await page.evaluate(() =>
      Number(getComputedStyle(document.documentElement).getPropertyValue("--ombra-pull-live")),
    );

    expect(Math.abs(live)).toBeGreaterThan(0.02);
    await page.mouse.up();
    await rememberProperties();
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--ombra-pull-live").trim(),
        ),
      )
      .toBe("0");
    await expect(viewer).toHaveAttribute("data-phase", "open");
  });

  await span("close", async () => {
    await page.keyboard.press("Escape");
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await rememberProperties();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  const trace = await page.evaluate(() => window.__ombraBudget);

  if (!trace) throw new Error("The frame sampler was not installed");

  const allowed = new Set<string>(ANIMATED_PROPERTY_NAMES);
  const unexpected: string[] = [];

  for (const prop of seen) {
    if (!allowed.has(prop)) unexpected.push(prop);
  }

  expect(unexpected).toEqual([]);
  expect(seen.size).toBeGreaterThan(0);

  for (const gesture of spans) {
    const frames = framesInside(trace.samples, gesture.start, gesture.end);

    expect(frames.count, `${gesture.name} sampled frames`).toBeGreaterThan(2);
    expect(frames.longest, `${gesture.name} longest frame`).toBeLessThanOrEqual(
      CHROMIUM_FRAME_CEILING_MS,
    );

    for (const longFrame of trace.longFrames) {
      if (longFrame.t < gesture.start || longFrame.t > gesture.end) continue;

      expect(longFrame.duration, `${gesture.name} long-animation-frame`).toBeLessThanOrEqual(
        CHROMIUM_FRAME_CEILING_MS,
      );
    }

    let slowest = 0;

    for (const interaction of trace.interactions) {
      if (interaction.t < gesture.start || interaction.t > gesture.end) continue;

      if (interaction.duration > slowest) slowest = interaction.duration;
    }

    expect(slowest, `${gesture.name} interaction`).toBeLessThanOrEqual(INP_LIMIT_MS);
    testInfo.annotations.push({
      type: gesture.name,
      description: `${frames.longest.toFixed(1)} ms frame, ${slowest.toFixed(1)} ms interaction`,
    });
  }
});

function framesInside(samples: readonly FrameSample[], start: number, end: number): FrameWindow {
  let longest = 0;
  let count = 0;

  for (const sample of samples) {
    if (sample.t <= start || sample.t > end) continue;

    count += 1;

    if (sample.dt > longest) longest = sample.dt;
  }

  return { longest, count };
}

/** Two touch pointers spreading apart, as the zoom hook sees a pinch. */
function pinch(target: Locator) {
  return target.evaluate(async (node) => {
    const rect = node.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

    const send = (type: string, pointerId: number, clientX: number) => {
      node.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
          pointerId,
          isPrimary: pointerId === 91,
          clientX,
          clientY: y,
        }),
      );
    };

    send("pointerdown", 91, x - 20);
    send("pointerdown", 92, x + 20);
    await frame();

    for (let step = 1; step <= 6; step += 1) {
      send("pointermove", 91, x - 20 - step * 15);
      send("pointermove", 92, x + 20 + step * 15);
      await frame();
    }

    send("pointerup", 91, x - 110);
    send("pointerup", 92, x + 110);
    await frame();
  });
}
