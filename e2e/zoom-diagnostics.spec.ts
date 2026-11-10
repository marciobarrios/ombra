import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("leaves zoom diagnostics off by default", async ({ page }) => {
  await page.goto("/spike");
  await expect(page.getByRole("radio", { name: "FLIP" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Download zoom diagnostics" })).toHaveCount(0);
  expect(await page.evaluate(() => "ombraZoomDiagnostics" in window)).toBe(false);
});

for (const engine of ["vt", "flip", "fade"]) {
  test(`records zoom/reset and resized controls with ${engine}`, async ({ page }, testInfo) => {
    await page.goto(`/spike?engine=${engine}&debug=zoom`);
    await page.locator("[data-slot=ombra-trigger]").nth(2).click();

    const viewer = page.locator("[data-slot=ombra-viewer]");
    const track = page.locator("[data-slot=ombra-track]");
    const zoomOut = page.getByRole("button", { name: "Zoom out" });

    await expect(viewer).toHaveAttribute("data-phase", "open");
    await expect(page.getByRole("button", { name: "Zoom in" })).toHaveCSS(
      "touch-action",
      "manipulation",
    );
    await expect(zoomOut).toHaveCSS("touch-action", "manipulation");
    await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveCSS(
      "touch-action",
      "manipulation",
    );

    const bounds = await track.boundingBox();

    if (!bounds) throw new Error("The track has no bounds");

    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;

    // Synthetic pointers exercise component arbitration, not Safari's native pinch recognizer.
    await track.dispatchEvent("pointerdown", {
      pointerId: 71,
      pointerType: "touch",
      clientX: x - 40,
      clientY: y,
    });
    await track.dispatchEvent("pointerdown", {
      pointerId: 72,
      pointerType: "touch",
      clientX: x + 40,
      clientY: y,
    });
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    // Move both contacts in one frame so the 1.5x pinch has a fixed baseline.
    await track.evaluate(
      (node, point) => {
        for (const [pointerId, clientX] of [
          [71, point.x - 60],
          [72, point.x + 60],
        ]) {
          node.dispatchEvent(
            new PointerEvent("pointermove", {
              bubbles: true,
              pointerId,
              pointerType: "touch",
              clientX,
              clientY: point.y,
            }),
          );
        }
      },
      { x, y },
    );
    await expect(viewer).toHaveAttribute("data-zoomed", "true");
    await track.dispatchEvent("pointerup", {
      pointerId: 71,
      pointerType: "touch",
      clientX: x - 60,
      clientY: y,
    });
    await track.dispatchEvent("pointerup", {
      pointerId: 72,
      pointerType: "touch",
      clientX: x + 60,
      clientY: y,
    });

    await zoomOut.click();
    await zoomOut.click();
    await expect(viewer).toHaveAttribute("data-zoomed", "false");
    await expect(zoomOut).toBeDisabled();
    await expect(track).toHaveCSS("touch-action", "pan-x");
    await page
      .locator("[data-slot=ombra-slide][data-active=true] [data-slot=ombra-image]")
      .dblclick();
    await expect(viewer).toHaveAttribute("data-zoomed", "true");

    await page.setViewportSize({ width: 402, height: 620 });

    for (const name of ["Close", "Zoom in", "Zoom out"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });
    }

    await zoomOut.click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(viewer).toBeHidden();

    const pendingDownload = page.waitForEvent("download");

    await page.getByRole("button", { name: "Download zoom diagnostics" }).click();
    const download = await pendingDownload;
    const destination = testInfo.outputPath("zoom-diagnostics.json");

    await download.saveAs(destination);
    const recording = JSON.parse(await readFile(destination, "utf8"));

    expect(recording.userAgent).toBeTruthy();
    expect(recording.samples.length).toBeLessThanOrEqual(1200);
    expect(recording.samples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "pointerdown",
          pointer: expect.objectContaining({ id: 71, type: "touch", trusted: false }),
        }),
        expect.objectContaining({
          reason: "window-resize",
          layout: expect.objectContaining({ innerHeight: 620 }),
        }),
        expect.objectContaining({
          viewer: expect.objectContaining({
            engine,
            zoomed: "true",
            transform: expect.any(String),
            close: expect.objectContaining({ width: 44 }),
          }),
          viewport: expect.objectContaining({ scale: 1 }),
        }),
      ]),
    );

    // The safeguard applies only to viewer controls; the page keeps native zoom available.
    await expect(page.locator("body")).toHaveCSS("touch-action", "auto");
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");

    expect(viewport).not.toMatch(/user-scalable=no|maximum-scale=1/);
  });
}
