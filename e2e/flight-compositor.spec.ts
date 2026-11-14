import { expect, test } from "@playwright/test";

const firstPhoto = "Desert road through red rock toward a distant peak";

// WebKit runs a clip-path animation on the main thread, which stalled FLIP in Low
// Power Mode (MAR-96). The clone's crop is a clip box, so it only animates transform.
for (const kind of ["open", "close"] as const) {
  test(`the FLIP clone animates only transform on ${kind}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1");

    const viewer = page.locator("[data-slot=ombra-viewer]");

    if (kind === "close") {
      await page.getByRole("button", { name: firstPhoto }).click();
      await expect(viewer).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
      await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);
      await page.keyboard.press("Escape");
    } else {
      await page.getByRole("button", { name: firstPhoto }).click();
    }

    const properties = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const read = () => {
            const flight = document.querySelector("[data-slot=ombra-flight]");

            if (!flight) {
              requestAnimationFrame(read);

              return;
            }

            const animated = new Set<string>();

            for (const animation of document.getAnimations()) {
              const effect = animation.effect;

              if (!(effect instanceof KeyframeEffect)) continue;

              if (effect.target !== flight && effect.target?.parentElement !== flight) continue;

              for (const frame of effect.getKeyframes()) {
                for (const key of Object.keys(frame)) {
                  if (!["offset", "computedOffset", "easing", "composite"].includes(key)) {
                    animated.add(key);
                  }
                }
              }
            }

            resolve([...animated]);
          };

          read();
        }),
    );

    expect(properties).toEqual(["transform"]);
  });
}
