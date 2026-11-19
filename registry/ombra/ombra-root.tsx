"use client";

import { Dialog } from "@base-ui/react/dialog";
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";

import {
  createGalleryState,
  duplicateIds,
  galleryReducer,
  isOpen,
  isOpening,
  neighbourAfterRemoval,
} from "./gallery-state";
import type { GalleryAction, GalleryState } from "./gallery-state";
import { useReducerWithBailout } from "./use-reducer-with-bailout";

/** Why an opening starts. A reversal carries the finger's upward speed into the morph. */
export type OmbraOpenIntent =
  | { reason: "trigger" }
  | { reason: "programmatic" }
  | { reason: "reverse"; speed: number };

/**
 * Runs the morphs. The root decides whether the viewer opens or closes; the driver moves it,
 * and reports the phases back with `send`. Returns false when it cannot open yet, such as
 * before its trigger has mounted, and the root tries again on its next render.
 */
export type OmbraDriver = {
  open: (itemId: string, intent: OmbraOpenIntent) => boolean;
  close: () => void;
};

export type OmbraRootProps = {
  children?: ReactNode;
  /** Controlled open state. A closing viewer already counts as closed. */
  open?: boolean;
  defaultOpen?: boolean;
  /**
   * Called when the viewer asks to open or close. A controlled parent may ignore it, or
   * answer later: a request made from a trigger is kept for about a second.
   */
  onOpenChange?: (open: boolean) => void;
  /** Controlled active item. */
  activeId?: string | null;
  defaultActiveId?: string | null;
  /** Called when the viewer asks to show another item. A controlled parent may ignore it. */
  onActiveIdChange?: (itemId: string) => void;
};

/** A trigger's element, and the media a morph flies from. */
export type OmbraTriggerSource = {
  itemId: string;
  element: HTMLElement;
  media: HTMLElement | null;
};

export type OmbraTriggerRegistration = {
  itemId: string;
  element: HTMLElement;
  /** The thumbnail a morph starts from. Defaults to the first image inside the trigger. */
  media?: () => HTMLElement | null;
};

/** A slide's element, registered by `OmbraSlide`. */
export type OmbraSlideRegistration = { itemId: string; element: HTMLElement };

/** The full-size media a morph lands on, registered by `OmbraMedia`, and its intrinsic size. */
export type OmbraMediaSource = {
  itemId: string;
  element: HTMLElement;
  width: number;
  height: number;
};

/** A zoom surface, registered by `OmbraZoom`. Only an item with one can zoom. */
export type OmbraZoomRegistration = { itemId: string; element: HTMLElement };

/** The viewer's zoom, which `OmbraZoomIn` and `OmbraZoomOut` drive. */
export type OmbraZoomControls = {
  zoomIn: () => void;
  zoomOut: () => void;
  /** Whether the active item rests above its fitted size. */
  zoomed: () => boolean;
};

/** The slide track, registered by `OmbraSlides`. Its slides publish the active item as they scroll. */
export type OmbraSlidesHandle = {
  element: HTMLElement;
  /** False while the track scrolls or snaps. */
  settled: () => boolean;
  /** The item a smooth navigation is heading for, until the track rests or a finger takes it. */
  navigationTarget: () => string | null;
  /** The item whose slide is nearest the track's centre. */
  centred: () => string | null;
  /** Scrolls the track so the item's slide is centred. */
  scrollTo: (itemId: string, behavior: ScrollBehavior) => void;
  /**
   * Goes to an item. A smooth scroll publishes each slide it centres on the way, rather than
   * selecting the destination first.
   */
  navigate: (itemId: string, behavior: ScrollBehavior) => void;
  /** Snaps to the slide nearest the centre and selects it. */
  settle: () => void;
};

/**
 * What holds the track still. A zoom gesture owns its scroll position, so the track neither
 * publishes nor snaps; a zoomed photo only stops the snap back to the active item.
 */
export type OmbraTrackHold = "free" | "gesture" | "zoomed";

export type OmbraRootContextValue = {
  /** The phase and collection. `activeId` here is the resolved one, controlled or not. */
  state: GalleryState;
  send: (action: GalleryAction) => void;
  /** Asks to open on `itemId`. False when it is not registered, or the driver could not start. */
  requestOpen: (itemId: string, intent?: OmbraOpenIntent) => boolean;
  requestClose: () => void;
  /** Asks to make `itemId` active. Safe on a hot path: an unchanged ID does nothing. */
  requestActive: (itemId: string) => void;
  /** The active item as of the latest request, before React renders it. */
  latestActiveId: () => string | null;
  /** Registers an item. Its node, when given, places it in navigation order by document position. */
  registerItem: (itemId: string, node?: Element | null) => () => void;
  /** Registers a trigger as its item's morph source and focus target. */
  registerTrigger: (trigger: OmbraTriggerRegistration) => () => void;
  /** The first trigger still on the page for `itemId`, in document order. */
  triggerFor: (itemId: string) => OmbraTriggerSource | null;
  /** Registers a slide's element for its item. */
  registerSlide: (slide: OmbraSlideRegistration) => () => void;
  /** The first slide still on the page for `itemId`, in document order. */
  slideFor: (itemId: string) => HTMLElement | null;
  /** The item a slide element belongs to. */
  slideItem: (element: Element) => string | null;
  /** Registers the media a morph lands on for its item. */
  registerMedia: (media: OmbraMediaSource) => () => void;
  /** The first media still on the page for `itemId`, in document order. */
  mediaFor: (itemId: string) => OmbraMediaSource | null;
  /** Registers a zoom surface for its item. */
  registerZoom: (zoom: OmbraZoomRegistration) => () => void;
  /** The first zoom surface still on the page for `itemId`, in document order. */
  zoomFor: (itemId: string) => HTMLElement | null;
  /** Called when a zoom surface mounts or leaves, or the viewer's zoom changes. */
  subscribeZoom: (listener: () => void) => () => void;
  /** Tells the zoom subscribers that the viewer's zoom changed. */
  notifyZoom: () => void;
  /** Set by the viewer, so the zoom actions can drive it. */
  zoomControlsRef: RefObject<OmbraZoomControls | null>;
  /** Registers the slide track. One track per root. */
  registerSlides: (slides: OmbraSlidesHandle) => () => void;
  /** The mounted slide track. */
  slides: () => OmbraSlidesHandle | null;
  /** Called when the slide track mounts or leaves. */
  subscribeSlides: (listener: () => void) => () => void;
  /** Set by the viewer, so a zoom gesture can hold the track. */
  trackHoldRef: RefObject<(() => OmbraTrackHold) | null>;
  driverRef: RefObject<OmbraDriver | null>;
  /** The Base UI dialog's actions. The root unmounts the dialog once the phase is "closed". */
  dialogActionsRef: RefObject<Dialog.Root.Actions | null>;
};

const OmbraRootContext = createContext<OmbraRootContextValue | null>(null);

export function useOmbraRoot(): OmbraRootContextValue {
  const context = useContext(OmbraRootContext);

  if (!context) throw new Error("Ombra parts must be rendered inside <OmbraRoot>.");

  return context;
}

type Registration = { itemId: string; node: Element | null };

type PendingOpen = {
  itemId: string;
  intent: OmbraOpenIntent;
  /** Uncontrolled open, controlled active item: opens only if the parent selects `itemId`. */
  awaitsActive: boolean;
  /** The controlled `activeId` when the request was made, to tell a refusal from a wait. */
  activeBefore: string | null | undefined;
};

/**
 * How long a request waits for a controlled parent that answers later, such as one that
 * puts `activeId` in the URL. A parent that never answers has refused once this passes.
 */
const REQUEST_LAPSE_MS = 1000;

/** Items with a node in document order, then items without one in registration order. */
function documentOrder(registrations: Iterable<Registration>): string[] {
  const all = [...registrations];

  const placed = all
    .filter((registration) => registration.node !== null)
    .sort((a, b) => {
      if (!a.node || !b.node || a.node === b.node) return 0;

      return a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

  return [...placed, ...all.filter((registration) => registration.node === null)].map(
    (registration) => registration.itemId,
  );
}

function resolveActive(itemId: string | null, ids: readonly string[]): string | null {
  return itemId !== null && ids.includes(itemId) ? itemId : (ids[0] ?? null);
}

/** The first registration still on the page for `itemId`, in document order. */
function firstConnected<Part extends { itemId: string; element: HTMLElement }>(
  parts: Iterable<Part>,
  itemId: string,
): Part | null {
  let first: Part | null = null;

  for (const part of parts) {
    if (part.itemId !== itemId || !part.element.isConnected) continue;

    const before =
      first !== null &&
      part.element.compareDocumentPosition(first.element) & Node.DOCUMENT_POSITION_FOLLOWING;

    if (first === null || before) first = part;
  }

  return first;
}

function sourceOf(trigger: OmbraTriggerRegistration): OmbraTriggerSource {
  const media = trigger.media?.() ?? trigger.element.querySelector("img");

  return { itemId: trigger.itemId, element: trigger.element, media };
}

/** The trigger that owns the open dialog, found after the triggers' refs attach. */
type OwnerAction = { type: "owner-found"; triggerId: string | null };

function ownerReducer(_: string | null, action: OwnerAction): string | null {
  return action.triggerId;
}

function warn(message: string) {
  if (process.env.NODE_ENV !== "production") console.warn(`Ombra: ${message}`);
}

/** Coordinates open state, the active item, item registration and the morph lifecycle. Renders no element. */
export function OmbraRoot({
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  activeId: activeProp,
  defaultActiveId = null,
  onActiveIdChange,
}: OmbraRootProps) {
  const [state, send] = useReducerWithBailout(galleryReducer, createGalleryState(defaultActiveId));
  const controlledOpen = openProp !== undefined;
  const controlledActive = activeProp !== undefined;
  const requested = controlledActive ? activeProp : state.activeId;

  // The collection the requested item was last seen in, so a controlled item that was
  // removed resolves to its neighbour before the parent has picked one.
  const lastSeen = useRef<{ itemId: string; ids: readonly string[] } | null>(null);

  let activeId: string | null;

  if (requested !== null && state.itemIds.includes(requested)) {
    activeId = requested;
    lastSeen.current = { itemId: requested, ids: state.itemIds };
  } else if (requested !== null && lastSeen.current?.itemId === requested) {
    activeId =
      neighbourAfterRemoval(lastSeen.current.ids, state.itemIds, requested) ??
      state.itemIds[0] ??
      null;
  } else {
    activeId = state.itemIds[0] ?? null;
  }

  const registrations = useRef(new Map<symbol, Registration>());
  const idsRef = useRef(state.itemIds);
  const phaseRef = useRef(state.phase);
  const activeRef = useRef(activeId);
  const askedActive = useRef<string | null>(null);
  const pendingOpen = useRef<PendingOpen | null>(null);
  const drivenOpen = useRef(false);
  const drivenClose = useRef(false);
  const defaultOpened = useRef(false);
  const emptied = useRef(false);
  const warned = useRef(new Set<string>());
  const flushQueued = useRef(false);
  const driverRef = useRef<OmbraDriver | null>(null);
  const dialogActionsRef = useRef<Dialog.Root.Actions | null>(null);
  const triggers = useRef(new Set<OmbraTriggerRegistration>());
  const props = useRef({ controlledOpen, controlledActive, onOpenChange, onActiveIdChange });

  props.current = { controlledOpen, controlledActive, onOpenChange, onActiveIdChange };
  phaseRef.current = state.phase;
  activeRef.current = activeId;

  // Unresolved, so an initial or controlled ID still counts before its item registers.
  const requestedRef = useRef(requested);

  requestedRef.current = requested;

  if (activeProp !== undefined && activeProp === askedActive.current) askedActive.current = null;

  const warnOnce = useCallback((key: string, message: string) => {
    if (warned.current.has(key)) return;

    warned.current.add(key);
    warn(message);
  }, []);

  // Without a viewer, the phases still advance so the state stays truthful.
  const driver = useCallback(
    (): OmbraDriver =>
      driverRef.current ?? {
        open: (itemId) => {
          send({ type: "open-requested", itemId, restart: true });
          send({ type: "opened" });

          return true;
        },
        close: () => {
          send({ type: "close-requested", releaseScroll: false });
          send({ type: "closed" });
        },
      },
    [send],
  );

  const flush = useCallback(() => {
    flushQueued.current = false;

    const ordered = documentOrder(registrations.current.values());

    for (const id of duplicateIds(ordered)) {
      warnOnce(`duplicate:${id}`, `more than one item is registered as "${id}".`);
    }

    const unique = [...new Set(ordered)];

    idsRef.current = unique;
    send({ type: "items-registered", itemIds: unique });
  }, [send, warnOnce]);

  const registerItem = useCallback(
    (itemId: string, node: Element | null = null) => {
      const key = Symbol(itemId);

      const queueFlush = () => {
        // The root's own layout effect flushes after its children's. A part that registers
        // without the root rendering again still lands before the next frame.
        if (flushQueued.current) return;

        flushQueued.current = true;
        queueMicrotask(flush);
      };

      registrations.current.set(key, { itemId, node });
      queueFlush();

      return () => {
        registrations.current.delete(key);
        queueFlush();
      };
    },
    [flush],
  );

  const triggerFor = useCallback((itemId: string): OmbraTriggerSource | null => {
    const first = firstConnected(triggers.current, itemId);

    return first && sourceOf(first);
  }, []);

  const slideParts = useRef(new Set<OmbraSlideRegistration>());
  const mediaParts = useRef(new Set<OmbraMediaSource>());
  const slidesHandle = useRef<OmbraSlidesHandle | null>(null);
  const slidesListeners = useRef(new Set<() => void>());
  const trackHoldRef = useRef<(() => OmbraTrackHold) | null>(null);
  const zoomParts = useRef(new Set<OmbraZoomRegistration>());
  const zoomListeners = useRef(new Set<() => void>());
  const zoomControlsRef = useRef<OmbraZoomControls | null>(null);

  const registerSlide = useCallback((slide: OmbraSlideRegistration) => {
    slideParts.current.add(slide);

    return () => {
      slideParts.current.delete(slide);
    };
  }, []);

  const slideFor = useCallback(
    (itemId: string) => firstConnected(slideParts.current, itemId)?.element ?? null,
    [],
  );

  const slideItem = useCallback((element: Element) => {
    for (const slide of slideParts.current) {
      if (slide.element === element) return slide.itemId;
    }

    return null;
  }, []);

  const registerMedia = useCallback((media: OmbraMediaSource) => {
    mediaParts.current.add(media);

    return () => {
      mediaParts.current.delete(media);
    };
  }, []);

  const mediaFor = useCallback((itemId: string) => firstConnected(mediaParts.current, itemId), []);

  const notifyZoom = useCallback(() => {
    for (const listener of zoomListeners.current) listener();
  }, []);

  // Every slide of an opening viewer registers its surface at once: tell the listeners once.
  const zoomNotifyQueued = useRef(false);

  const queueZoomNotify = useCallback(() => {
    if (zoomNotifyQueued.current) return;

    zoomNotifyQueued.current = true;
    queueMicrotask(() => {
      zoomNotifyQueued.current = false;
      notifyZoom();
    });
  }, [notifyZoom]);

  const registerZoom = useCallback(
    (zoom: OmbraZoomRegistration) => {
      zoomParts.current.add(zoom);
      queueZoomNotify();

      return () => {
        zoomParts.current.delete(zoom);
        queueZoomNotify();
      };
    },
    [queueZoomNotify],
  );

  const zoomFor = useCallback(
    (itemId: string) => firstConnected(zoomParts.current, itemId)?.element ?? null,
    [],
  );

  const subscribeZoom = useCallback((listener: () => void) => {
    zoomListeners.current.add(listener);

    return () => {
      zoomListeners.current.delete(listener);
    };
  }, []);

  const notifySlides = useCallback(() => {
    for (const listener of slidesListeners.current) listener();
  }, []);

  const registerSlides = useCallback(
    (handle: OmbraSlidesHandle) => {
      if (slidesHandle.current && slidesHandle.current.element !== handle.element) {
        warn("more than one <OmbraSlides> is mounted in one root; the latest one is used.");
      }

      slidesHandle.current = handle;
      notifySlides();

      return () => {
        if (slidesHandle.current !== handle) return;

        slidesHandle.current = null;
        notifySlides();
      };
    },
    [notifySlides],
  );

  const slides = useCallback(() => slidesHandle.current, []);

  const subscribeSlides = useCallback((listener: () => void) => {
    slidesListeners.current.add(listener);

    return () => {
      slidesListeners.current.delete(listener);
    };
  }, []);

  const [ownerId, sendOwner] = useReducerWithBailout(ownerReducer, null);

  // Base UI marks the current item's trigger as the one that owns the dialog, so its
  // `aria-expanded` and default focus return follow navigation, not the opening press.
  const syncOwner = useCallback(() => {
    const itemId = phaseRef.current === "closed" ? null : activeRef.current;
    const owner = itemId === null ? null : triggerFor(itemId);

    sendOwner({ type: "owner-found", triggerId: owner?.element.id || null });
  }, [triggerFor, sendOwner]);

  const registerTrigger = useCallback(
    (trigger: OmbraTriggerRegistration) => {
      triggers.current.add(trigger);
      // A trigger can mount or leave without the root rendering again.
      queueMicrotask(syncOwner);

      return () => {
        triggers.current.delete(trigger);
        queueMicrotask(syncOwner);
      };
    },
    [syncOwner],
  );

  const askParentForActive = useCallback((itemId: string) => {
    if (askedActive.current === itemId) return;

    askedActive.current = itemId;
    props.current.onActiveIdChange?.(itemId);
  }, []);

  const requestActive = useCallback(
    (itemId: string) => {
      if (!idsRef.current.includes(itemId)) return;

      if (itemId === activeRef.current) {
        // Back on the item the parent kept, so the next swipe away may ask again.
        askedActive.current = null;

        return;
      }

      if (props.current.controlledActive) {
        askParentForActive(itemId);

        return;
      }

      activeRef.current = itemId;
      send({ type: "active-changed", itemId });
      props.current.onActiveIdChange?.(itemId);
    },
    [send, askParentForActive],
  );

  /** A request the parent has to answer. A newer request, a close, or silence replaces it. */
  const holdForParent = useCallback((pending: PendingOpen) => {
    pendingOpen.current = pending;

    window.setTimeout(() => {
      if (pendingOpen.current === pending) pendingOpen.current = null;
    }, REQUEST_LAPSE_MS);
  }, []);

  /** Starts the driver, then reports what changed. */
  const startOpen = useCallback(
    (itemId: string, intent: OmbraOpenIntent) => {
      const wasClosed = !isOpening(phaseRef.current);
      const changed = itemId !== activeRef.current;

      if (!driver().open(itemId, intent)) return false;

      drivenClose.current = false;

      if (!props.current.controlledActive && changed) {
        activeRef.current = itemId;
        props.current.onActiveIdChange?.(itemId);
      }

      if (!props.current.controlledOpen && wasClosed) props.current.onOpenChange?.(true);

      return true;
    },
    [driver],
  );

  const requestOpen = useCallback(
    (itemId: string, intent: OmbraOpenIntent = { reason: "trigger" }) => {
      if (!idsRef.current.includes(itemId)) {
        warnOnce(`unmatched:${itemId}`, `nothing is registered as "${itemId}", so it cannot open.`);

        return false;
      }

      const { controlledOpen: openIsControlled, controlledActive: activeIsControlled } =
        props.current;

      if (activeIsControlled && itemId !== activeRef.current) askParentForActive(itemId);

      if (openIsControlled) {
        // The parent decides. The effect below starts the morph once `open` arrives.
        holdForParent({ itemId, intent, awaitsActive: false, activeBefore: requestedRef.current });

        if (!isOpening(phaseRef.current)) props.current.onOpenChange?.(true);

        return true;
      }

      if (activeIsControlled && itemId !== activeRef.current) {
        // Refusing the item refuses the open, so the viewer never shows an item the parent declined.
        holdForParent({ itemId, intent, awaitsActive: true, activeBefore: requestedRef.current });

        return true;
      }

      return startOpen(itemId, intent);
    },
    [askParentForActive, holdForParent, startOpen, warnOnce],
  );

  const requestClose = useCallback(() => {
    if (!isOpening(phaseRef.current)) return;

    pendingOpen.current = null;
    props.current.onOpenChange?.(false);

    if (!props.current.controlledOpen) driver().close();
  }, [driver]);

  useLayoutEffect(() => {
    flush();
    syncOwner();
  });

  // The dialog stays mounted until the driver reports its close landed. This runs after the
  // Base UI root below has seen `open` turn false, which a child's effect would precede.
  useLayoutEffect(() => {
    if (state.phase === "closed") dialogActionsRef.current?.unmount();
  }, [state.phase]);

  // Follows a controlled `open`, a controlled active item an open waits on, the initial
  // `defaultOpen`, and an emptied collection. Runs every commit, so a phase that drifted
  // from the prop, as a View Transition opening can, is put right.
  useLayoutEffect(() => {
    const ids = idsRef.current;

    // A request for an item that has since left the collection is void.
    if (pendingOpen.current && !ids.includes(pendingOpen.current.itemId)) {
      pendingOpen.current = null;
    }

    const pending = pendingOpen.current;

    // A View Transition close stays "open" until its update callback runs. One close per
    // closing, so a commit in between does not start a second transition.
    if (!isOpening(state.phase)) drivenClose.current = false;

    if (controlledOpen && openProp) {
      if (!drivenOpen.current && ids.length > 0) {
        const itemId =
          pending && !controlledActive ? pending.itemId : resolveActive(requestedRef.current, ids);

        if (itemId && startOpen(itemId, pending?.intent ?? { reason: "programmatic" })) {
          drivenOpen.current = true;
          pendingOpen.current = null;
        }
      }
    } else if (controlledOpen) {
      drivenOpen.current = false;

      if (isOpening(state.phase) && !drivenClose.current) {
        drivenClose.current = true;
        driver().close();
      }
    } else if (pending?.awaitsActive) {
      // Accepted: open on it. Answered with another item: refused. Otherwise still waiting.
      if (activeRef.current === pending.itemId) {
        pendingOpen.current = null;
        startOpen(pending.itemId, pending.intent);
      } else if (requestedRef.current !== pending.activeBefore) {
        pendingOpen.current = null;
      }
    }

    const initial = resolveActive(requestedRef.current, ids);

    if (!controlledOpen && defaultOpen && !defaultOpened.current && initial !== null) {
      defaultOpened.current = driver().open(initial, { reason: "programmatic" });
    }

    if (ids.length > 0) {
      emptied.current = false;
    } else if (isOpening(state.phase) && !emptied.current) {
      emptied.current = true;
      requestClose();
    }
  });

  // An active item that left the collection hands over to its neighbour. The consumer
  // only hears about it here, because no request made the change.
  const previousActive = useRef(activeId);

  useLayoutEffect(() => {
    const previous = previousActive.current;

    previousActive.current = activeId;

    if (previous === null || activeId === null || previous === activeId) return;

    if (state.itemIds.includes(previous)) return;

    // The parent picked the replacement itself in the same update.
    if (controlledActive && activeId === activeProp) return;

    if (controlledActive) askParentForActive(activeId);
    else onActiveIdChange?.(activeId);
  }, [activeId, activeProp, state.itemIds, controlledActive, askParentForActive, onActiveIdChange]);

  useLayoutEffect(() => {
    if (!controlledActive || activeProp === null || state.itemIds.length === 0) return;

    if (state.itemIds.includes(activeProp) || lastSeen.current?.itemId === activeProp) return;

    warnOnce(`unmatched:${activeProp}`, `activeId "${activeProp}" matches no registered item.`);
  }, [state.itemIds, activeProp, controlledActive, warnOnce]);

  // Checked once, against the first items that register.
  const defaultChecked = useRef(false);

  useLayoutEffect(() => {
    if (defaultChecked.current || state.itemIds.length === 0) return;

    defaultChecked.current = true;

    if (controlledActive || defaultActiveId === null) return;

    if (!state.itemIds.includes(defaultActiveId)) {
      warnOnce(
        `unmatched:${defaultActiveId}`,
        `defaultActiveId "${defaultActiveId}" matches no registered item.`,
      );
    }
  }, [state.itemIds, controlledActive, defaultActiveId, warnOnce]);

  const value = useMemo<OmbraRootContextValue>(
    () => ({
      state: activeId === state.activeId ? state : { ...state, activeId },
      send,
      requestOpen,
      requestClose,
      requestActive,
      latestActiveId: () => activeRef.current,
      registerItem,
      registerTrigger,
      triggerFor,
      registerSlide,
      slideFor,
      slideItem,
      registerMedia,
      mediaFor,
      registerZoom,
      zoomFor,
      subscribeZoom,
      notifyZoom,
      zoomControlsRef,
      registerSlides,
      slides,
      subscribeSlides,
      trackHoldRef,
      driverRef,
      dialogActionsRef,
    }),
    [
      state,
      activeId,
      send,
      requestOpen,
      requestClose,
      requestActive,
      registerItem,
      registerTrigger,
      triggerFor,
      registerSlide,
      slideFor,
      slideItem,
      registerMedia,
      mediaFor,
      registerZoom,
      zoomFor,
      subscribeZoom,
      notifyZoom,
      registerSlides,
      slides,
      subscribeSlides,
    ],
  );

  return (
    <OmbraRootContext.Provider value={value}>
      <Dialog.Root
        open={isOpen(state)}
        triggerId={ownerId}
        // A close that releases the page lets it scroll while the photo fades out.
        modal={state.phase === "closing" && state.releaseScroll ? false : true}
        actionsRef={dialogActionsRef}
        onOpenChange={(next, details) => {
          if (next) {
            // The root opens the viewer, so Base UI does not open it a second time.
            details.cancel();

            const pressed = [...triggers.current].find(
              (trigger) => trigger.element === details.trigger,
            );

            if (pressed) requestOpen(pressed.itemId, { reason: "trigger" });

            return;
          }

          // The viewer stays mounted until the driver's close morph lands.
          details.preventUnmountOnClose();

          requestClose();
        }}
      >
        {children}
      </Dialog.Root>
    </OmbraRootContext.Provider>
  );
}
