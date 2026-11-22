import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const firstPhoto = "Desert road through red rock toward a distant peak";

/** One line per violation, so a failure names the rule and the node. */
function violationReport(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => JSON.stringify(node.target)).join("; ");

      return `${violation.id}: ${violation.help} [${targets}]`;
    })
    .join("\n");
}

async function settle(page: Page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.pause();
  });
}

async function expectNoViolations(page: Page, include: string) {
  const results = await new AxeBuilder({ page }).include(include).analyze();

  expect(results.violations, violationReport(results.violations)).toEqual([]);
}

test.describe("accessibility", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the open viewer has no axe violations in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/spike?engine=fade");
      await page.getByRole("button", { name: firstPhoto }).click();

      const dialog = page.getByRole("dialog", { name: firstPhoto });

      await expect(dialog).toBeVisible();
      await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");
      await expect(page.getByRole("status")).toContainText("1 of");
      await settle(page);
      await expectNoViolations(page, "[data-slot=ombra-viewer]");
    });

    test(`the gallery has no axe violations in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/spike?engine=fade");
      await expect(page.locator("[data-slot=ombra-trigger]").first()).toBeVisible();
      await settle(page);
      await expectNoViolations(page, "[data-slot=ombra-root]");
    });

    test(`the open album has no axe violations in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/spike/album");
      await page.locator("[data-slot=ombra-trigger]").click();
      await expect(page.locator("[data-slot=ombra-album]")).toHaveAttribute("data-phase", "open");
      await settle(page);
      await expectNoViolations(page, "[data-slot=ombra-album]");
    });
  }

  test("tab stays inside the viewer and escape returns focus", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=fade");

    const trigger = page.getByRole("button", { name: firstPhoto });

    await trigger.click();

    const dialog = page.getByRole("dialog", { name: firstPhoto });
    const close = dialog.getByRole("button", { name: "Close", exact: true });

    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await expect(close).not.toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();

    // Shift+Tab from the first control wraps, and a long Tab walk never leaves the dialog.
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await expect(close).not.toBeFocused();

    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press("Tab");
      await expect(dialog.locator(":focus")).toHaveCount(1);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("arrow keys move the photo while the track is focused", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=fade");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const track = page.locator("[data-slot=ombra-track]");

    for (let step = 0; step < 8; step += 1) {
      if (await track.evaluate((node) => node === document.activeElement)) break;

      await page.keyboard.press("Tab");
    }

    await expect(track).toBeFocused();
    await expect
      .poll(() => track.evaluate((node) => getComputedStyle(node).outlineStyle))
      .not.toBe("none");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("status")).toContainText("2 of");
    await page.keyboard.press("Home");
    await expect(page.getByRole("status")).toContainText("1 of");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("button", { name: firstPhoto })).toBeFocused();
  });
});
