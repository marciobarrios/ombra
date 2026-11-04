import { expect, test } from "@playwright/test";

const firstPhoto = "Desert road through red rock toward a distant peak";

test.describe("spike viewer", () => {
  test("opens, moves with the keyboard, and returns focus", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/spike?engine=fade");

    const trigger = page.getByRole("button", { name: firstPhoto });

    await trigger.click();

    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-slot=ombra-counter]")).toHaveText("1 / 12");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("status")).toContainText("2 of 12");
    await page.keyboard.press("Home");
    await expect(page.getByRole("status")).toContainText("1 of 12");
    await page.keyboard.press("End");
    await expect(page.getByRole("status")).toContainText("12 of 12");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Granite cliff rising over a sunlit meadow" }),
    ).toBeFocused();
  });

  test("selects the engine from the query string", async ({ page }) => {
    await page.goto("/spike?engine=vt");
    await expect(page.getByRole("radio", { name: "View Transition" })).toBeChecked();

    await page.goto("/spike?engine=flip");
    await expect(page.getByRole("radio", { name: "FLIP" })).toBeChecked();

    await page.goto("/spike?engine=fade");
    await expect(page.getByRole("radio", { name: "Fade" })).toBeChecked();
  });

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

  test("escape during a slow flip still closes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 8_000 });
  });
});
