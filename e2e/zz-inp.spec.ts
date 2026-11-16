import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";

const firstPhoto = "Desert road through red rock toward a distant peak";

test("open click timing", async ({ page, browserName }, info) => {
  test.skip(browserName !== "chromium" || info.project.name !== "chromium");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto("/spike?engine=flip");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    const out: unknown[] = [];
    (window as unknown as { inp: unknown[] }).inp = out;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceEventTiming[]) {
        out.push({ name: e.name, dur: Math.round(e.duration), delay: Math.round(e.processingStart - e.startTime), proc: Math.round(e.processingEnd - e.processingStart), present: Math.round(e.startTime + e.duration - e.processingEnd) });
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
  });
  await page.waitForTimeout(500);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
  await cdp.send("Profiler.start");
  await page.getByRole("button", { name: firstPhoto }).click();
  await page.waitForTimeout(1500);
  const { profile } = await cdp.send("Profiler.stop");
  writeFileSync(process.env.PROFILE_OUT ?? "/tmp/profile.json", JSON.stringify(profile));
  console.log(JSON.stringify(await page.evaluate(() => (window as unknown as { inp: unknown[] }).inp)));
});
