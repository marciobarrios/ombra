import { expect, test } from "@playwright/test";

import { judgeMomentum, startMomentumTail } from "../registry/ombra/wheel-momentum";
import type { MomentumVerdict } from "../registry/ombra/wheel-momentum";

type Step = { dy: number; dx?: number; open: boolean };

/** Runs a wheel stream after a closing event of `closing` pixels, one verdict per event. */
function run(closing: number, steps: readonly Step[]): MomentumVerdict[] {
  let tail = startMomentumTail(closing);

  return steps.map((step) => {
    const judged = judgeMomentum(tail, step.dx ?? 0, step.dy, step.open);

    tail = judged.tail;

    return judged.verdict;
  });
}

const during = (...dys: number[]) => dys.map((dy) => ({ dy, open: true }));
const after = (...dys: number[]) => dys.map((dy) => ({ dy, open: false }));

test.describe("wheel momentum after a close", () => {
  test("a quick swipe's momentum peaks during the close and is swallowed to the end", () => {
    // The swipe closed the viewer at 30 while the fingers still sped up.
    const verdicts = run(30, [
      ...during(60, 80, 90, 80, 70),
      ...after(64, 50, 38, 28, 20, 14, 9, 5, 3, 2),
    ]);

    expect(verdicts.every((verdict) => verdict === "swallow")).toBe(true);
  });

  test("a swipe still speeding up when a reduced-motion close ends is swallowed to the end", () => {
    const verdicts = run(35, after(60, 80, 90, 70, 50, 30, 15, 5, 2));

    expect(verdicts.every((verdict) => verdict === "swallow")).toBe(true);
  });

  test("a scroll that starts once the tail has slowed reaches the page", () => {
    const verdicts = run(40, [...during(30), ...after(20, 12, 8, 30, 45)]);

    expect(verdicts).toEqual(["swallow", "swallow", "swallow", "swallow", "release", "release"]);
  });

  test("mouse wheel notches that hold their size reach the page", () => {
    const verdicts = run(100, after(100, 100, 100));

    expect(verdicts).toEqual(["swallow", "swallow", "release"]);
  });

  test("a turn or a sideways swipe ends the swallow even during the close", () => {
    expect(run(40, during(-20))).toEqual(["release"]);
    expect(run(40, [{ dy: 5, dx: 30, open: true }])).toEqual(["release"]);
  });
});
