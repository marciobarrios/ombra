// What `OmbraMedia` knows about the image inside it: whether it has painted or failed, and
// the natural size it reported, which stands in for a `width` and `height` the caller left out.

export type MediaStatus = "loading" | "loaded" | "error";

export type MediaSize = { width: number; height: number };

export type MediaState = { status: MediaStatus; natural: MediaSize | null };

export type MediaAction =
  | { type: "image-loaded"; width: number; height: number }
  | { type: "image-failed" }
  | { type: "image-pending" };

export const initialMediaState: MediaState = { status: "loading", natural: null };

/** Returns the same state when nothing changes, so a repeated event does not re-render. */
export function mediaReducer(state: MediaState, action: MediaAction): MediaState {
  switch (action.type) {
    case "image-loaded": {
      if (!(action.width > 0) || !(action.height > 0)) return state;

      // The first file sets the ratio, and a later, sharper one only the width: the box has
      // already painted, and a ratio rounded differently would move it.
      const natural = state.natural
        ? {
            width: action.width,
            height: (action.width * state.natural.height) / state.natural.width,
          }
        : { width: action.width, height: action.height };

      const same =
        state.natural?.width === natural.width && state.natural.height === natural.height;

      if (state.status === "loaded" && same) return state;

      return { status: "loaded", natural: same ? state.natural : natural };
    }

    case "image-failed":
      if (state.status === "error") return state;

      // A size the image already reported still holds: only its file failed.
      return { status: "error", natural: state.natural };

    case "image-pending":
      if (state.status === "loading") return state;

      // The known size holds, so the box does not move while the new image loads.
      return { status: "loading", natural: state.natural };
  }
}

/**
 * The size the media boxes itself to: the caller's when it gave both, otherwise the image's
 * natural size once known, otherwise none yet.
 */
export function mediaSize(
  width: number | undefined,
  height: number | undefined,
  natural: MediaSize | null,
): MediaSize | null {
  if (width !== undefined && height !== undefined && width > 0 && height > 0) {
    return { width, height };
  }

  return natural;
}
