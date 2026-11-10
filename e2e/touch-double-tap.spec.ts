import { expect, test } from "@playwright/test";

for (const delay of [0, 400]) {
  for (const spring of [false, true]) {
    test(`handles a touch double-tap once with spring ${spring ? "on" : "off"} and ${delay}ms compatibility delay`, async ({
      page,
    }) => {
      await page.goto(`/spike?engine=fade${spring ? "&spring=1" : ""}`);
      await page.locator("[data-slot=ombra-trigger]").nth(2).click();

      const viewer = page.locator("[data-slot=ombra-viewer]");

      const layer = page.locator(
        "[data-slot=ombra-slide][data-active=true] [data-slot=ombra-zoom]",
      );

      await expect(viewer).toHaveAttribute("data-phase", "open");
      await expect(layer).toHaveCSS("touch-action", "manipulation");

      async function doubleTap() {
        // Safari's observed sequence: two touch pairs, then a compatibility dblclick.
        // Dispatch together so test-runner latency cannot exceed the double-tap window.
        await layer.evaluate(async (node, compatibilityDelay) => {
          const rect = node.getBoundingClientRect();
          const point = { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 };

          for (const pointerId of [71, 72]) {
            for (const type of ["pointerdown", "pointerup"]) {
              node.dispatchEvent(
                new PointerEvent(type, {
                  bubbles: true,
                  pointerType: "touch",
                  pointerId,
                  ...point,
                }),
              );
            }
          }

          // Reproduce the 334ms compatibility delay measured in iOS Safari.
          if (compatibilityDelay)
            await new Promise((resolve) => setTimeout(resolve, compatibilityDelay));

          node.dispatchEvent(
            new MouseEvent("dblclick", { bubbles: true, cancelable: true, ...point }),
          );
        }, delay);
      }

      await doubleTap();
      await expect(viewer).toHaveAttribute("data-zoomed", "true");
      await expect
        .poll(() => layer.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a))
        .toBeCloseTo(2.5, 2);

      await doubleTap();
      await expect
        .poll(() => layer.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a))
        .toBeCloseTo(1, 2);
      await expect(viewer).toHaveAttribute("data-zoomed", "false");

      // A real mouse sequence immediately after touch must still be handled.
      await layer.dblclick();
      await expect
        .poll(() => layer.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a))
        .toBeCloseTo(2.5, 2);
    });
  }
}
