// The viewer's open and close state machine and its item collection. No framework import, so
// other variants can drive it.

export type Phase = "closed" | "opening" | "open" | "closing";

export type GalleryState = {
  phase: Phase;
  /** The active item. Null only while the collection is empty and no initial item was given. */
  activeId: string | null;
  /** Registered item IDs in navigation order, without duplicates. */
  itemIds: readonly string[];
  /** Bumped when a FLIP or fade morph has to start again, even if `phase` did not change. */
  epoch: number;
};

export type GalleryAction =
  /** `restart` is false for a View Transition, which runs outside the FLIP effect. */
  | { type: "open-requested"; itemId: string; restart: boolean }
  | { type: "opened" }
  | { type: "close-requested" }
  | { type: "closed" }
  | { type: "active-changed"; itemId: string }
  /** The registered items changed: added, removed, or reordered. */
  | { type: "items-registered"; itemIds: readonly string[] };

export function createGalleryState(activeId: string | null = null): GalleryState {
  return { phase: "closed", activeId, itemIds: [], epoch: 0 };
}

export const initialGalleryState: GalleryState = createGalleryState();

/** The viewer is mounted for the whole of an opening, the open state, and a closing. */
export function isOpen(state: GalleryState): boolean {
  return state.phase !== "closed";
}

/** The active item's position in the collection, or -1 when there is none. */
export function activeIndex(state: GalleryState): number {
  return state.activeId === null ? -1 : state.itemIds.indexOf(state.activeId);
}

/** Open as the consumer sees it: a closing viewer is already closed for `onOpenChange`. */
export function isOpening(phase: Phase): boolean {
  return phase === "opening" || phase === "open";
}

/** Returns the same object when an action changes nothing, so callers can skip a render. */
export function galleryReducer(state: GalleryState, action: GalleryAction): GalleryState {
  switch (action.type) {
    case "open-requested":
      // An empty collection, or an ID nothing registered, has nothing to show.
      if (!state.itemIds.includes(action.itemId)) return state;

      // Also valid from "closing": a reversed close opens again from the clone's pose.
      return {
        ...state,
        phase: "opening",
        activeId: action.itemId,
        epoch: action.restart ? state.epoch + 1 : state.epoch,
      };

    case "opened":
      if (state.phase !== "opening") return state;

      return { ...state, phase: "open" };

    case "close-requested":
      if (state.phase !== "opening" && state.phase !== "open") return state;

      return { ...state, phase: "closing", epoch: state.epoch + 1 };

    case "closed":
      if (state.phase === "closed") return state;

      return { ...state, phase: "closed" };

    case "active-changed":
      if (state.activeId === action.itemId || !state.itemIds.includes(action.itemId)) return state;

      return { ...state, activeId: action.itemId };

    case "items-registered": {
      const itemIds = uniqueIds(action.itemIds);

      if (sameIds(state.itemIds, itemIds)) return state;

      return {
        ...state,
        itemIds,
        activeId: activeAfterChange(state.itemIds, itemIds, state.activeId),
      };
    }
  }
}

/**
 * Keeps the active item when it is still registered. An item that was removed hands over to
 * its nearest remaining neighbour, the next one first. An ID that was never registered, such as
 * a missing initial item, falls back to the first item.
 */
export function activeAfterChange(
  previous: readonly string[],
  next: readonly string[],
  activeId: string | null,
): string | null {
  if (activeId !== null && next.includes(activeId)) return activeId;

  if (activeId !== null && previous.includes(activeId)) {
    return neighbourAfterRemoval(previous, next, activeId);
  }

  return next[0] ?? activeId;
}

/** The nearest item after `removedId` that is still registered, else the nearest before it. */
export function neighbourAfterRemoval(
  previous: readonly string[],
  next: readonly string[],
  removedId: string,
): string | null {
  const at = previous.indexOf(removedId);

  for (const id of previous.slice(at + 1)) if (next.includes(id)) return id;

  for (const id of previous.slice(0, Math.max(0, at)).reverse()) if (next.includes(id)) return id;

  return null;
}

/** IDs registered more than once, each listed once. */
export function duplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);

    seen.add(id);
  }

  return [...duplicates];
}

function uniqueIds(ids: readonly string[]): readonly string[] {
  return duplicateIds(ids).length === 0 ? ids : [...new Set(ids)];
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, at) => id === b[at]);
}
