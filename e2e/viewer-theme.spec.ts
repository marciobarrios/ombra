import { expect, test } from "@playwright/test";

const firstPhoto = "Desert road through red rock toward a distant peak";

// iOS Safari tints its bars from the page surface while the backdrop fades in, so the
// backdrop must be the page background in either scheme (MAR-105).
for (const colorScheme of ["light", "dark"] as const) {
  test(`the viewer backdrop matches the page background in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/spike");
    await page.getByRole("button", { name: firstPhoto }).click();
    await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

    const { backdrop, body, ink, foreground } = await page.evaluate(() => {
      const read = (selector: string, property: "backgroundColor" | "color") => {
        const element = document.querySelector(selector);

        return element ? getComputedStyle(element)[property] : "";
      };

      return {
        backdrop: read("[data-slot=ombra-backdrop]", "backgroundColor"),
        body: getComputedStyle(document.body).backgroundColor,
        ink: read("[data-slot=ombra-viewer]", "color"),
        foreground: getComputedStyle(document.body).color,
      };
    });

    expect(backdrop).toBe(body);
    expect(ink).toBe(foreground);
  });
}

// A manual theme overrides the system setting, persists across loads, and the viewer follows
// it (MAR-106).
test("a chosen dark theme persists and the viewer follows it on a light system", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  const lightBody = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  // Wait for hydration, so the click reaches the radio's handler.
  await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
  await page.getByTitle("Dark").click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();

  await page.locator("[data-slot=ombra-trigger]").first().click();
  await expect(page.locator("[data-slot=ombra-viewer]")).toHaveAttribute("data-phase", "open");

  const { backdrop, body } = await page.evaluate(() => ({
    backdrop: getComputedStyle(document.querySelector("[data-slot=ombra-backdrop]")!)
      .backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
  }));

  expect(body).not.toBe(lightBody);
  expect(backdrop).toBe(body);
});
