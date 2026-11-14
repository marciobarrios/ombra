// The gallery's open and close state machine. No framework import, so other variants can drive it.

export type Phase = "closed" | "opening" | "open" | "closing";

export type GalleryState = {
  phase: Phase;
  /** The active slide. */
  index: number;
  /** Bumped when a FLIP or fade morph has to start again, even if `phase` did not change. */
  epoch: number;
  /** A close from an off-screen thumbnail lets the page scroll while the viewer fades out. */
  releaseScroll: boolean;
};

export type GalleryAction =
  /** `restart` is false for a View Transition, which runs outside the FLIP effect. */
  | { type: "open"; index: number; restart: boolean }
  | { type: "opened" }
  | { type: "close"; releaseScroll: boolean }
  | { type: "closed" }
  | { type: "index-changed"; index: number };

export const initialGalleryState: GalleryState = {
  phase: "closed",
  index: 0,
  epoch: 0,
  releaseScroll: false,
};

/** The viewer is mounted for the whole of an opening, the open state, and a closing. */
export function isOpen(state: GalleryState): boolean {
  return state.phase !== "closed";
}

/** Returns the same object when an action changes nothing, so callers can skip a render. */
export function galleryReducer(state: GalleryState, action: GalleryAction): GalleryState {
  switch (action.type) {
    case "open":
      // Also valid from "closing": a reversed close opens again from the clone's pose.
      return {
        ...state,
        phase: "opening",
        index: action.index,
        epoch: action.restart ? state.epoch + 1 : state.epoch,
      };

    case "opened":
      if (state.phase !== "opening") return state;

      return { ...state, phase: "open" };

    case "close":
      if (state.phase !== "opening" && state.phase !== "open") return state;

      return {
        ...state,
        phase: "closing",
        epoch: state.epoch + 1,
        releaseScroll: action.releaseScroll,
      };

    case "closed":
      if (state.phase === "closed") return state;

      return { ...state, phase: "closed", releaseScroll: false };

    case "index-changed":
      if (state.index === action.index) return state;

      return { ...state, index: action.index };
  }
}
