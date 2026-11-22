import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { assertWithinBudget, isBannedSpecifier, measureCore } from "./core-size.ts";
import {
  ANIMATED_PROPERTY_NAMES,
  CHROMIUM_FRAME_CEILING_MS,
  CORE_GZIP_LIMIT_BYTES,
  CORE_GZIP_MEASURED_BYTES,
  INP_LIMIT_MS,
  IPHONE_FRAME_LIMIT_MS,
} from "./limits.ts";

const within: Parameters<typeof assertWithinBudget>[0] = {
  gzipBytes: 1,
  minifiedBytes: 1,
  limitBytes: CORE_GZIP_LIMIT_BYTES,
  banned: [],
};

test("fails when the gzipped core exceeds the limit", () => {
  assert.throws(
    () => assertWithinBudget({ ...within, gzipBytes: CORE_GZIP_LIMIT_BYTES + 1 }),
    /over the/,
  );
});

test("fails when the core imports an animation library", () => {
  assert.throws(() => assertWithinBudget({ ...within, banned: ["motion"] }), /motion/);
});

test("accepts a bundle on the limit with no animation library", () => {
  assert.doesNotThrow(() => assertWithinBudget({ ...within, gzipBytes: CORE_GZIP_LIMIT_BYTES }));
});

test("flags animation libraries and not the morph helpers", () => {
  assert.equal(isBannedSpecifier("motion"), true);
  assert.equal(isBannedSpecifier("motion/react"), true);
  assert.equal(isBannedSpecifier("framer-motion"), true);
  assert.equal(isBannedSpecifier("@react-spring/web"), true);
  assert.equal(isBannedSpecifier("./morph.ts"), false);
  assert.equal(isBannedSpecifier("./use-reduced-motion.ts"), false);
});

test("the gallery and album bundle stays inside the gzip budget and includes zoom", async () => {
  const measurement = await measureCore();

  assert.ok(
    measurement.gzipBytes > 12 * 1024,
    "the bundle should be larger than the retired 12 KB proposal",
  );
  assert.equal(measurement.gzipBytes, CORE_GZIP_MEASURED_BYTES);
  assertWithinBudget(measurement);
});

test("the docs quote the enforced ceilings", () => {
  const page = readFileSync(
    new URL("../../apps/docs/app/performance/page.tsx", import.meta.url),
    "utf8",
  );

  const report = readFileSync(new URL("../../PERFORMANCE.md", import.meta.url), "utf8");
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  const frames = readFileSync(new URL("../../e2e/frame-budget.spec.ts", import.meta.url), "utf8");

  const phrases = [
    `${CORE_GZIP_LIMIT_BYTES / 1024} KB`,
    `${CORE_GZIP_MEASURED_BYTES.toLocaleString("en-US")} bytes`,
    `${IPHONE_FRAME_LIMIT_MS} ms`,
    `${CHROMIUM_FRAME_CEILING_MS} ms`,
    `${INP_LIMIT_MS} ms`,
    "--ombra-pull-live",
  ];

  for (const source of [page, report]) {
    for (const phrase of phrases) assert.match(source, new RegExp(escapeRegExp(phrase)));
  }

  assert.match(readme, /pnpm budget/);
  assert.match(readme, /PERFORMANCE\.md/);

  assert.match(frames, /CHROMIUM_FRAME_CEILING_MS/);
  assert.match(frames, /INP_LIMIT_MS/);
  assert.match(frames, /ANIMATED_PROPERTY_NAMES/);
  assert.ok(ANIMATED_PROPERTY_NAMES.includes("transform"));
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
