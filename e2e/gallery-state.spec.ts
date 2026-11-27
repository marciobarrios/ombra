import { expect, test } from "@playwright/test";

import {
  activeAfterChange,
  createGalleryState,
  duplicateIds,
  galleryReducer,
  initialGalleryState,
  isOpen,
  neighbourAfterRemoval,
} from "../registry/ombra/gallery-state";
import type { GalleryState } from "../registry/ombra/gallery-state";

const ids = ["a", "b", "c", "d", "e"];

const opened: GalleryState = {
  phase: "open",
  activeId: "c",
  itemIds: ids,
  epoch: 1,
};

const registered: GalleryState = { ...initialGalleryState, activeId: "a", itemIds: ids };

test.describe("gallery state", () => {
  test("starts closed with no items", () => {
    expect(initialGalleryState).toEqual({
      phase: "closed",
      activeId: null,
      itemIds: [],
      epoch: 0,
    });
    expect(isOpen(initialGalleryState)).toBe(false);
    expect(createGalleryState("c").activeId).toBe("c");
  });

  test("a FLIP or fade open selects the item and restarts the morph", () => {
    const next = galleryReducer(registered, {
      type: "open-requested",
      itemId: "d",
      restart: true,
    });

    expect(next).toEqual({ ...registered, phase: "opening", activeId: "d", epoch: 1 });
    expect(isOpen(next)).toBe(true);
  });

  test("a View Transition open leaves the epoch alone", () => {
    const next = galleryReducer(registered, {
      type: "open-requested",
      itemId: "b",
      restart: false,
    });

    expect(next.phase).toBe("opening");
    expect(next.epoch).toBe(0);
  });

  test("an empty collection cannot open", () => {
    const action = { type: "open-requested", itemId: "a", restart: true } as const;

    expect(galleryReducer(initialGalleryState, action)).toBe(initialGalleryState);
  });

  test("an unregistered item cannot open", () => {
    const action = { type: "open-requested", itemId: "z", restart: true } as const;

    expect(galleryReducer(registered, action)).toBe(registered);
  });

  test("a reversed close opens again", () => {
    const closing: GalleryState = { ...opened, phase: "closing", epoch: 2 };
    const next = galleryReducer(closing, { type: "open-requested", itemId: "c", restart: true });

    expect(next.phase).toBe("opening");
    expect(next.epoch).toBe(3);
  });

  test("an opening settles into open, and only an opening does", () => {
    const opening: GalleryState = { ...opened, phase: "opening" };

    expect(galleryReducer(opening, { type: "opened" }).phase).toBe("open");

    for (const phase of ["closed", "open", "closing"] as const) {
      const state: GalleryState = { ...opened, phase };

      expect(galleryReducer(state, { type: "opened" })).toBe(state);
    }
  });

  test("a close restarts the morph", () => {
    const next = galleryReducer(opened, { type: "close-requested" });

    expect(next).toEqual({ ...opened, phase: "closing", epoch: 2 });
  });

  test("a downward drag can close an opening", () => {
    const opening: GalleryState = { ...opened, phase: "opening" };

    expect(galleryReducer(opening, { type: "close-requested" }).phase).toBe("closing");
  });

  test("a close does nothing once the viewer is closed or closing", () => {
    for (const phase of ["closed", "closing"] as const) {
      const state: GalleryState = { ...opened, phase };

      expect(galleryReducer(state, { type: "close-requested" })).toBe(state);
    }
  });

  test("closed keeps the item", () => {
    const closing: GalleryState = { ...opened, phase: "closing" };
    const next = galleryReducer(closing, { type: "closed" });

    expect(next).toEqual({ ...opened, phase: "closed" });
    expect(galleryReducer(next, { type: "closed" })).toBe(next);
  });

  test("an unchanged or unregistered active item returns the same state", () => {
    expect(galleryReducer(opened, { type: "active-changed", itemId: "c" })).toBe(opened);
    expect(galleryReducer(opened, { type: "active-changed", itemId: "z" })).toBe(opened);
    expect(galleryReducer(opened, { type: "active-changed", itemId: "e" }).activeId).toBe("e");
  });
});

test.describe("item registration", () => {
  test("the same IDs in the same order change nothing", () => {
    expect(galleryReducer(opened, { type: "items-registered", itemIds: [...ids] })).toBe(opened);
  });

  test("a reorder keeps the active item", () => {
    const next = galleryReducer(opened, {
      type: "items-registered",
      itemIds: ["e", "d", "c", "b", "a"],
    });

    expect(next.activeId).toBe("c");
    expect(next.itemIds).toEqual(["e", "d", "c", "b", "a"]);
    expect(next.phase).toBe("open");
  });

  test("removing the active item selects the next one, or the previous at the end", () => {
    const removeC = galleryReducer(opened, { type: "items-registered", itemIds: ["a", "b", "d"] });

    expect(removeC.activeId).toBe("d");

    const last: GalleryState = { ...opened, activeId: "e" };
    const removeE = galleryReducer(last, { type: "items-registered", itemIds: ["a", "b", "c"] });

    expect(removeE.activeId).toBe("c");
  });

  test("removing several items at once skips to the nearest survivor", () => {
    expect(neighbourAfterRemoval(ids, ["a", "e"], "c")).toBe("e");
    expect(neighbourAfterRemoval(ids, ["a"], "c")).toBe("a");
    expect(neighbourAfterRemoval(ids, [], "c")).toBeNull();
  });

  test("removing every item leaves no active item", () => {
    const next = galleryReducer(opened, { type: "items-registered", itemIds: [] });

    expect(next.activeId).toBeNull();
    expect(next.itemIds).toEqual([]);
  });

  test("an initial item waits for its registration, then falls back to the first", () => {
    const waiting = createGalleryState("c");

    expect(galleryReducer(waiting, { type: "items-registered", itemIds: ids }).activeId).toBe("c");
    expect(activeAfterChange([], ["a", "b"], "c")).toBe("a");
    expect(activeAfterChange([], [], "c")).toBe("c");
  });

  test("duplicate IDs are reported once and registered once", () => {
    expect(duplicateIds(["a", "b", "a", "a", "c", "b"])).toEqual(["a", "b"]);
    expect(duplicateIds(ids)).toEqual([]);

    const next = galleryReducer(initialGalleryState, {
      type: "items-registered",
      itemIds: ["a", "b", "a"],
    });

    expect(next.itemIds).toEqual(["a", "b"]);
  });
});
