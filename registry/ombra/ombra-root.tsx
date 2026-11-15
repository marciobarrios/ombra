"use client";

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
  /** Called when the viewer asks to open or close. A controlled parent may ignore it. */
  onOpenChange?: (open: boolean) => void;
  /** Controlled active item. */
  activeId?: string | null;
  defaultActiveId?: string | null;
  /** Called when the viewer asks to show another item. A controlled parent may ignore it. */
  onActiveIdChange?: (itemId: string) => void;
};

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
  driverRef: RefObject<OmbraDriver | null>;
};

const OmbraRootContext = createContext<OmbraRootContextValue | null>(null);

export function useOmbraRoot(): OmbraRootContextValue {
  const context = useContext(OmbraRootContext);

  if (!context) throw new Error("Ombra parts must be rendered inside <OmbraRoot>.");

  return context;
}

type Registration = { itemId: string; node: Element | null };

function documentOrder(registrations: Iterable<Registration>): string[] {
  return [...registrations]
    .sort((a, b) => {
      if (!a.node || !b.node || a.node === b.node) return 0;

      return a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    })
    .map((registration) => registration.itemId);
}

function resolveActive(itemId: string | null, ids: readonly string[]): string | null {
  return itemId !== null && ids.includes(itemId) ? itemId : (ids[0] ?? null);
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
  const activeId = resolveActive(requested, state.itemIds);

  const registrations = useRef(new Map<symbol, Registration>());
  const idsRef = useRef(state.itemIds);
  const phaseRef = useRef(state.phase);
  const activeRef = useRef(activeId);
  const askedActive = useRef<string | null>(null);
  const pendingOpen = useRef<{ itemId: string; intent: OmbraOpenIntent } | null>(null);
  const drivenOpen = useRef(false);
  const defaultOpened = useRef(false);
  const warned = useRef(new Set<string>());
  const flushQueued = useRef(false);
  const driverRef = useRef<OmbraDriver | null>(null);
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

      registrations.current.set(key, { itemId, node });

      // The root's own layout effect flushes after its children's. A part that registers
      // without the root rendering again still lands before the next frame.
      if (!flushQueued.current) {
        flushQueued.current = true;
        queueMicrotask(flush);
      }

      return () => {
        registrations.current.delete(key);

        if (!flushQueued.current) {
          flushQueued.current = true;
          queueMicrotask(flush);
        }
      };
    },
    [flush],
  );

  const requestActive = useCallback(
    (itemId: string) => {
      if (!idsRef.current.includes(itemId)) return;

      if (itemId === activeRef.current) {
        // Back on the item the parent kept, so the next swipe away may ask again.
        askedActive.current = null;

        return;
      }

      const { controlledActive: controlled, onActiveIdChange: notify } = props.current;

      if (controlled) {
        if (askedActive.current === itemId) return;

        askedActive.current = itemId;
        notify?.(itemId);

        return;
      }

      activeRef.current = itemId;
      send({ type: "active-changed", itemId });
      notify?.(itemId);
    },
    [send],
  );

  const requestOpen = useCallback(
    (itemId: string, intent: OmbraOpenIntent = { reason: "trigger" }) => {
      if (!idsRef.current.includes(itemId)) {
        warnOnce(`unmatched:${itemId}`, `nothing is registered as "${itemId}", so it cannot open.`);

        return false;
      }

      const { controlledOpen: controlled, onOpenChange: notify } = props.current;
      const closed = !isOpening(phaseRef.current);

      if (itemId !== activeRef.current) {
        if (props.current.controlledActive) requestActive(itemId);
        else props.current.onActiveIdChange?.(itemId);
      }

      if (controlled) {
        // The parent decides. The effect below starts the morph once `open` arrives.
        pendingOpen.current = { itemId, intent };

        if (closed) notify?.(true);

        return true;
      }

      if (closed) notify?.(true);

      return driver().open(itemId, intent);
    },
    [driver, requestActive, warnOnce],
  );

  const requestClose = useCallback(() => {
    if (!isOpening(phaseRef.current)) return;

    const { controlledOpen: controlled, onOpenChange: notify } = props.current;

    pendingOpen.current = null;
    notify?.(false);

    if (!controlled) driver().close();
  }, [driver]);

  useLayoutEffect(() => {
    flush();
  });

  // Follows a controlled `open`, the initial `defaultOpen`, and an emptied collection.
  useLayoutEffect(() => {
    const ids = idsRef.current;

    if (controlledOpen && openProp !== drivenOpen.current) {
      if (!openProp) {
        drivenOpen.current = false;
        pendingOpen.current = null;

        if (isOpening(state.phase)) driver().close();
      } else if (ids.length > 0) {
        const pending = pendingOpen.current;

        const itemId =
          pending && !controlledActive ? pending.itemId : resolveActive(requestedRef.current, ids);

        if (itemId && driver().open(itemId, pending?.intent ?? { reason: "programmatic" })) {
          drivenOpen.current = true;
          pendingOpen.current = null;
        }
      }
    }

    const initial = resolveActive(requestedRef.current, ids);

    if (!controlledOpen && defaultOpen && !defaultOpened.current && initial !== null) {
      defaultOpened.current = driver().open(initial, { reason: "programmatic" });
    }

    if (isOpen(state) && ids.length === 0) requestClose();
  });

  // A controlled active item that left the collection hands over to its neighbour.
  const previousIds = useRef(state.itemIds);

  useLayoutEffect(() => {
    const previous = previousIds.current;

    previousIds.current = state.itemIds;

    if (!controlledActive || activeProp === null || activeProp === undefined) return;

    if (state.itemIds.includes(activeProp)) return;

    if (previous.includes(activeProp)) {
      const neighbour = neighbourAfterRemoval(previous, state.itemIds, activeProp);

      if (neighbour !== null) requestActive(neighbour);

      return;
    }

    if (state.itemIds.length > 0) {
      warnOnce(`unmatched:${activeProp}`, `activeId "${activeProp}" matches no registered item.`);
    }
  }, [state.itemIds, activeProp, controlledActive, requestActive, warnOnce]);

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
      driverRef,
    }),
    [state, activeId, send, requestOpen, requestClose, requestActive, registerItem],
  );

  return <OmbraRootContext.Provider value={value}>{children}</OmbraRootContext.Provider>;
}
