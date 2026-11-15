import { expect, test } from "@playwright/test";

const firstPhoto = "Desert road through red rock toward a distant peak";

// WebKit runs a clip-path animation on the main thread, and the transform in the same
// effect with it, which stalled FLIP in Low Power Mode (MAR-96). The clone's crop is a
// clip box, so every effect that moves it animates transform alone. Its corners run in
// an effect of their own.
for (const kind of ["open", "close"] as const) {
  test(`the FLIP clone keeps transform in effects of its own on ${kind}`, async ({ page }) => {
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

    const effects = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const read = () => {
            const flight = document.querySelector("[data-slot=ombra-flight]");

            if (!flight) {
              requestAnimationFrame(read);

              return;
            }

            const found: string[] = [];

            for (const animation of document.getAnimations()) {
              const effect = animation.effect;

              if (!(effect instanceof KeyframeEffect)) continue;

              if (effect.target !== flight && effect.target?.parentElement !== flight) continue;

              const animated = new Set<string>();

              for (const frame of effect.getKeyframes()) {
                for (const key of Object.keys(frame)) {
                  if (!["offset", "computedOffset", "easing", "composite"].includes(key)) {
                    animated.add(key);
                  }
                }
              }

              const target = effect.target === flight ? "clip" : "image";

              found.push(`${target}:${[...animated].toSorted().join(",")}`);
            }

            resolve(found.toSorted());
          };

          read();
        }),
    );

    expect(effects).toEqual(["clip:borderRadius", "clip:transform", "image:transform"]);
  });
}

// The clip box scales unevenly, so its corners are counter-scaled to stay at the
// thumbnail's and the photo's 6px on screen. A fixed radius shrank towards the
// thumbnail and jumped back to 6px when the clone was removed.
for (const kind of ["open", "close"] as const) {
  test(`the FLIP clone keeps 6px corners on screen on ${kind}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/spike?engine=flip&slow=1");

    const viewer = page.locator("[data-slot=ombra-viewer]");

    await page.getByRole("button", { name: firstPhoto }).click();

    if (kind === "close") {
      await expect(viewer).toHaveAttribute("data-phase", "open", { timeout: 10_000 });
      await expect(page.locator("[data-slot=ombra-flight]")).toHaveCount(0);
      await page.keyboard.press("Escape");
    }

    const radii = await page.evaluate(
      (progresses) =>
        new Promise<number[][]>((resolve) => {
          const read = () => {
            const flight = document.querySelector<HTMLElement>("[data-slot=ombra-flight]");
            const animations = flight?.getAnimations() ?? [];

            if (!flight || animations.length === 0) {
              requestAnimationFrame(read);

              return;
            }

            const all = [...animations, ...(flight.firstElementChild?.getAnimations() ?? [])];
            const samples: number[][] = [];

            for (const progress of progresses) {
              for (const animation of all) {
                const duration = Number(animation.effect?.getComputedTiming().duration ?? 0);

                animation.pause();
                animation.currentTime = duration * progress;
              }

              const style = getComputedStyle(flight);
              const matrix = new DOMMatrixReadOnly(style.transform);

              const [horizontal = "0", vertical = horizontal] =
                style.borderTopLeftRadius.split(" ");

              samples.push([
                Number.parseFloat(horizontal) * matrix.a,
                Number.parseFloat(vertical) * matrix.d,
              ]);
            }

            resolve(samples);
          };

          read();
        }),
      [0, 0.5, 0.9, 1],
    );

    for (const [horizontal, vertical] of radii) {
      expect(horizontal).toBeCloseTo(6, 1);
      expect(vertical).toBeCloseTo(6, 1);
    }
  });
}
