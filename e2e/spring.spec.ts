import { expect, test } from "@playwright/test";

import { normalizeVelocity, springCurve } from "../registry/ombra/spring";

test.describe("spring solver", () => {
  test("stays finite when distance is zero or velocity is not", () => {
    expect(normalizeVelocity(1200, 0)).toBe(0);
    expect(normalizeVelocity(1200, 4)).toBe(0);
    expect(normalizeVelocity(Number.POSITIVE_INFINITY, 80)).toBe(12);
    expect(normalizeVelocity(Number.NaN, 80)).toBe(0);
    expect(normalizeVelocity(-1e9, 20)).toBe(-12);
  });

  test("builds a finite linear easing for extreme input", () => {
    const previous = globalThis.CSS;

    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      writable: true,
      value: { supports: () => true },
    });

    try {
      const curve = springCurve({
        stiffness: Number.POSITIVE_INFINITY,
        damping: Number.NaN,
        velocity: Number.POSITIVE_INFINITY,
      });

      expect(curve.linear).toBe(true);
      expect(curve.easing.startsWith("linear(")).toBe(true);
      expect(curve.easing).not.toMatch(/NaN|Infinity/);
      expect(curve.duration).toBeGreaterThan(0);
      expect(Number.isFinite(curve.duration)).toBe(true);
    } finally {
      if (previous === undefined) Reflect.deleteProperty(globalThis, "CSS");
      else globalThis.CSS = previous;
    }
  });

  test("keeps the cubic fallback finite when linear() is absent", () => {
    const previous = globalThis.CSS;

    Reflect.deleteProperty(globalThis, "CSS");

    try {
      const curve = springCurve({
        stiffness: Number.NaN,
        damping: Number.NEGATIVE_INFINITY,
        velocity: Number.NaN,
      });

      expect(curve.linear).toBe(false);
      expect(curve.easing.startsWith("cubic-bezier(")).toBe(true);
      expect(curve.easing).not.toMatch(/NaN|Infinity/);
      expect(curve.easing).not.toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    } finally {
      globalThis.CSS = previous;
    }
  });
});
