import { expect, test } from "@playwright/test";

import { initialMediaState, mediaReducer, mediaSize } from "../registry/ombra/media-status";

// MAR-24: OmbraMedia reports whether its image painted or failed, and measures it when
// the caller gave no size.
test.describe("media status", () => {
  test("a load reports the natural size, and a repeat changes nothing", () => {
    const loaded = mediaReducer(initialMediaState, {
      type: "image-loaded",
      width: 960,
      height: 640,
    });

    expect(loaded).toEqual({ status: "loaded", natural: { width: 960, height: 640 } });
    expect(mediaReducer(loaded, { type: "image-loaded", width: 960, height: 640 })).toBe(loaded);
  });

  test("a sharper file updates the natural size", () => {
    const thumb = mediaReducer(initialMediaState, {
      type: "image-loaded",
      width: 960,
      height: 640,
    });

    expect(
      mediaReducer(thumb, { type: "image-loaded", width: 1600, height: 1067 }).natural,
    ).toEqual({ width: 1600, height: 1067 });
  });

  test("a failure keeps a known size, and a later load recovers", () => {
    const thumb = mediaReducer(initialMediaState, {
      type: "image-loaded",
      width: 960,
      height: 640,
    });

    const failed = mediaReducer(thumb, { type: "image-failed" });

    expect(failed).toEqual({ status: "error", natural: thumb.natural });
    expect(mediaReducer(failed, { type: "image-failed" })).toBe(failed);
    expect(mediaReducer(failed, { type: "image-loaded", width: 960, height: 640 }).status).toBe(
      "loaded",
    );
  });

  test("a load with no pixels is ignored", () => {
    expect(mediaReducer(initialMediaState, { type: "image-loaded", width: 0, height: 0 })).toBe(
      initialMediaState,
    );
  });

  test("the caller's size wins, and the natural size stands in when either is missing", () => {
    const natural = { width: 960, height: 640 };

    expect(mediaSize(1600, 1067, natural)).toEqual({ width: 1600, height: 1067 });
    expect(mediaSize(undefined, 1067, natural)).toBe(natural);
    expect(mediaSize(0, 0, natural)).toBe(natural);
    expect(mediaSize(undefined, undefined, null)).toBeNull();
  });
});
