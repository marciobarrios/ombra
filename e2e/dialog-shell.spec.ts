import { expect, test } from "@playwright/test";

const contentSlot = "[data-slot=ombra-content]";

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

test("render and part handlers both run, and the caller can prevent dismissal", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Prevent close" }).click();
  await page.getByRole("button", { name: "Open custom shell" }).click();
  await page.getByRole("button", { name: "Cerrar fotos" }).click();
  await expect(page.getByTestId("events")).toHaveText("1/1");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Allow close" }).click();
  await page.getByRole("button", { name: "Open custom shell" }).click();
  await page.getByRole("button", { name: "Cerrar fotos" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByTestId("events")).toHaveText("2/2");
});

test("a backdrop press dismisses the custom shell", async ({ page }) => {
  await page.getByRole("button", { name: "Open custom shell" }).click();
  await page.locator("[data-slot=ombra-backdrop]").click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("merged refs locate morph and pull targets through render composition", async ({ page }) => {
  await page.getByRole("button", { name: "Open custom shell" }).click();
  await page.getByRole("button", { name: "Inspect targets" }).click();
  await expect(page.getByTestId("refs")).toHaveText("true");
  await expect(page.locator("[data-slot=ombra-image]")).toHaveCSS(
    "view-transition-name",
    "ombra-shared",
  );
  await page.locator(contentSlot).evaluate((node) => {
    const rect = node.getBoundingClientRect();

    const start = {
      pointerId: 1,
      pointerType: "touch",
      clientX: rect.x + 100,
      clientY: rect.y + 120,
      bubbles: true,
    };

    node.dispatchEvent(new PointerEvent("pointerdown", start));
    node.dispatchEvent(new PointerEvent("pointermove", { ...start, clientY: start.clientY + 50 }));
  });
  await expect(page.locator(contentSlot)).toHaveAttribute("data-pulling", "true");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(document.documentElement.style.getPropertyValue("--ombra-pull-live")),
      ),
    )
    .toBeGreaterThan(0);
  await page.locator(contentSlot).evaluate((node) => {
    node.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        pointerType: "touch",
        clientX: 132,
        clientY: 400,
        bubbles: true,
      }),
    );
    node.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
        pointerType: "touch",
        clientX: 132,
        clientY: 400,
        bubbles: true,
      }),
    );
  });
  await expect(page.getByRole("dialog")).toBeHidden();
});
