import { expect, test } from "@playwright/test";

import { GESTURE_TABLE, gestureMode, gestureOwner } from "../registry/ombra/gesture-arbitration";
import type {
  GestureInput,
  GestureMode,
  GestureOwner,
  GestureSignals,
} from "../registry/ombra/gesture-arbitration";

// MAR-22: the behaviour table, one row per mode. Each row lists the owner of
// drag x, drag y, pinch, wheel x, wheel y and wheel pinch, in that order.
const inputs: GestureInput[] = ["drag-x", "drag-y", "pinch", "wheel-x", "wheel-y", "wheel-pinch"];

const rows: Record<GestureMode, GestureOwner[]> = {
  idle: ["track", "pull", "zoom", "track", "pull", "zoom"],
  flinging: ["track", "pull", "none", "track", "pull", "none"],
  zoomed: ["zoom", "zoom", "zoom", "zoom", "zoom", "zoom"],
  handoff: ["zoom", "zoom", "none", "zoom", "zoom", "none"],
  pulling: ["pull", "pull", "none", "pull", "pull", "none"],
  pinching: ["zoom", "zoom", "zoom", "zoom", "zoom", "zoom"],
};

const rest: GestureSignals = {
  pulling: false,
  pinching: false,
  handoff: false,
  zoomed: false,
  rested: true,
};

test.describe("gesture arbitration", () => {
  test("the table has exactly these modes and inputs", () => {
    expect(Object.keys(GESTURE_TABLE).sort()).toEqual(Object.keys(rows).sort());

    for (const row of Object.values(GESTURE_TABLE)) {
      expect(Object.keys(row).sort()).toEqual([...inputs].sort());
    }
  });

  const modes: GestureMode[] = ["idle", "flinging", "zoomed", "handoff", "pulling", "pinching"];

  for (const mode of modes) {
    const owners = rows[mode];

    test(`${mode}: ${owners.join(", ")}`, () => {
      expect(inputs.map((input) => gestureOwner(mode, input))).toEqual(owners);
    });
  }

  test("signals pick the mode, and a gesture holding the photo outranks the state under it", () => {
    expect(gestureMode(rest)).toBe("idle");
    expect(gestureMode({ ...rest, rested: false })).toBe("flinging");
    expect(gestureMode({ ...rest, zoomed: true, rested: false })).toBe("zoomed");
    expect(gestureMode({ ...rest, zoomed: true, handoff: true })).toBe("handoff");
    expect(gestureMode({ ...rest, pinching: true, zoomed: true })).toBe("pinching");
    expect(gestureMode({ ...rest, pulling: true, pinching: true })).toBe("pulling");
  });
});
