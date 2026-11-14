import { expect, test } from "@playwright/test";

import { galleryReducer, initialGalleryState, isOpen } from "../registry/ombra/gallery-state";
import type { GalleryState } from "../registry/ombra/gallery-state";

const opened: GalleryState = { phase: "open", index: 2, epoch: 1, releaseScroll: false };

test.describe("gallery state", () => {
  test("starts closed on the first slide", () => {
    expect(initialGalleryState).toEqual({
      phase: "closed",
      index: 0,
      epoch: 0,
      releaseScroll: false,
    });
    expect(isOpen(initialGalleryState)).toBe(false);
  });

  test("a FLIP or fade open selects the slide and restarts the morph", () => {
    const next = galleryReducer(initialGalleryState, { type: "open", index: 3, restart: true });

    expect(next).toEqual({ phase: "opening", index: 3, epoch: 1, releaseScroll: false });
    expect(isOpen(next)).toBe(true);
  });

  test("a View Transition open leaves the epoch alone", () => {
    const next = galleryReducer(initialGalleryState, { type: "open", index: 1, restart: false });

    expect(next.phase).toBe("opening");
    expect(next.epoch).toBe(0);
  });

  test("a reversed close opens again", () => {
    const closing: GalleryState = { ...opened, phase: "closing", epoch: 2, releaseScroll: true };
    const next = galleryReducer(closing, { type: "open", index: 2, restart: true });

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

  test("a close restarts the morph and records whether the page may scroll", () => {
    const next = galleryReducer(opened, { type: "close", releaseScroll: true });

    expect(next).toEqual({ phase: "closing", index: 2, epoch: 2, releaseScroll: true });
  });

  test("a downward drag can close an opening", () => {
    const opening: GalleryState = { ...opened, phase: "opening" };

    expect(galleryReducer(opening, { type: "close", releaseScroll: false }).phase).toBe("closing");
  });

  test("a close does nothing once the viewer is closed or closing", () => {
    for (const phase of ["closed", "closing"] as const) {
      const state: GalleryState = { ...opened, phase };

      expect(galleryReducer(state, { type: "close", releaseScroll: true })).toBe(state);
    }
  });

  test("closed keeps the slide and clears the scroll release", () => {
    const closing: GalleryState = { ...opened, phase: "closing", releaseScroll: true };
    const next = galleryReducer(closing, { type: "closed" });

    expect(next).toEqual({ phase: "closed", index: 2, epoch: 1, releaseScroll: false });
    expect(galleryReducer(next, { type: "closed" })).toBe(next);
  });

  test("an unchanged index returns the same state", () => {
    expect(galleryReducer(opened, { type: "index-changed", index: 2 })).toBe(opened);
    expect(galleryReducer(opened, { type: "index-changed", index: 4 }).index).toBe(4);
  });
});
