import { expect, test } from "@playwright/test";

import { photos } from "../apps/docs/app/spike/photos";

// Spike: the viewer can be hosted by Base UI or UI SDK. These checks prove which one
// rendered, so a suite run with OMBRA_DIALOG=ui-sdk is not silently testing Base UI.

test("?dialog=ui-sdk hosts the viewer in the top layer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/spike?engine=flip&slow=1&dialog=ui-sdk");
  await page.getByRole("button", { name: photos[0].alt }).click();

  const viewer = page.locator("[data-slot=ombra-viewer]");

  await expect(viewer).toHaveAttribute("data-phase", "opening");

  const opening = await page.evaluate(() => {
    const shell = document.querySelector("[data-slot=ombra-viewer]")?.parentElement;
    const flight = document.querySelector("[data-slot=ombra-flight]");

    return {
      shell: shell?.getAttribute("data-slot"),
      shellOpen: shell?.matches(":popover-open") ?? false,
      // Only a top-layer clone can paint above a top-layer viewer.
      flightOpen: flight?.matches(":popover-open") ?? false,
    };
  });

  expect(opening).toMatchObject({ shell: "dialog-content", shellOpen: true, flightOpen: true });

  await expect(viewer).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: photos[0].alt })).toBeFocused();
});

test("?dialog=base-ui hosts the viewer in a portal", async ({ page }) => {
  await page.goto("/spike?engine=fade&dialog=base-ui");
  await page.getByRole("button", { name: photos[0].alt }).click();
  await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

  expect(
    await page
      .locator("[data-slot=ombra-viewer]")
      .evaluate((node) => node.matches(":popover-open")),
  ).toBe(false);
  expect(await page.locator("[data-slot=dialog-content]").count()).toBe(0);
});
