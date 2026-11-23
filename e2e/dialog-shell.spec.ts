import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/spike/dialog");
});

test("custom parts preserve modal semantics, focus, scroll position and native props", async ({
  page,
  isMobile,
}) => {
  const trigger = page.getByRole("button", { name: "Open custom shell" });

  await trigger.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 200));

  const before = await trigger.evaluate((node) => ({
    x: node.getBoundingClientRect().x,
    scroll: window.scrollY,
  }));

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Fotografías de viaje" });
  const close = dialog.getByRole("button", { name: "Cerrar fotos" });

  await expect(close).toBeFocused();
  await expect(dialog).toHaveAttribute("data-open");
  await expect(page.locator("[data-slot=ombra-backdrop]")).toHaveAttribute(
    "data-render-open",
    "true",
  );
  await expect(dialog).toHaveAttribute("data-custom-surface", "true");
  await expect(close).toHaveAttribute("data-custom-close", "true");
  await expect(page.locator("[data-slot=ombra-portal]")).toHaveClass(/custom-portal/);
  await expect(page.locator("[data-slot=ombra-backdrop]")).toHaveClass(/custom-backdrop/);
  await expect(page.locator("main")).toHaveAttribute("aria-hidden", "true");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before.scroll);
  await expect
    .poll(() =>
      page
        .locator("main [data-base-ui-click-trigger]")
        .evaluate((node) => node.getBoundingClientRect().x),
    )
    .toBe(before.x);

  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Inspect targets" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("PageDown");

  if (!isMobile) {
    await page.mouse.move(5, 5);
    await page.mouse.wheel(0, 300);
  }

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before.scroll);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator("main")).not.toHaveAttribute("aria-hidden", "true");
});

test("a backdrop press dismisses the custom shell", async ({ page }) => {
  await page.getByRole("button", { name: "Open custom shell" }).click();
  await page.locator("[data-slot=ombra-backdrop]").click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("dialog")).toBeHidden();
});
