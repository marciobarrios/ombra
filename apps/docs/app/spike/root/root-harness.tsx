"use client";

import { useEffect, useReducer } from "react";

import { OmbraGallery } from "../../../../../registry/ombra/ombra-gallery";
import type { OmbraItem } from "../../../../../registry/ombra/types";

import { photos } from "../photos";

import type { HarnessAction, Section } from "./harness-actions";

const initialItems = photos.slice(0, 5);

type Harness = {
  controlled: {
    items: readonly OmbraItem[];
    open: boolean;
    activeId: string | null;
    allowOpen: boolean;
    allowActive: boolean;
    allowClose: boolean;
    openAsks: boolean[];
    activeAsks: string[];
  };
  free: { items: readonly OmbraItem[]; openAsks: boolean[]; activeAsks: string[] };
  openOnly: { open: boolean; openAsks: boolean[] };
};

const initialHarness: Harness = {
  controlled: {
    items: initialItems,
    open: false,
    activeId: initialItems[0]?.id ?? null,
    allowOpen: true,
    allowActive: true,
    allowClose: true,
    openAsks: [],
    activeAsks: [],
  },
  free: { items: initialItems, openAsks: [], activeAsks: [] },
  openOnly: { open: false, openAsks: [] },
};

function withItems(state: Harness, section: Section, items: readonly OmbraItem[]): Harness {
  return section === "free"
    ? { ...state, free: { ...state.free, items } }
    : { ...state, controlled: { ...state.controlled, items } };
}

function harnessReducer(state: Harness, action: HarnessAction): Harness {
  const { controlled } = state;

  switch (action.type) {
    case "open-change-asked": {
      if (action.section === "openOnly") {
        const allowed = action.open ? controlled.allowOpen : controlled.allowClose;
        const openAsks = [...state.openOnly.openAsks, action.open];

        return {
          ...state,
          openOnly: { openAsks, open: allowed ? action.open : state.openOnly.open },
        };
      }

      if (action.section === "free") {
        return {
          ...state,
          free: { ...state.free, openAsks: [...state.free.openAsks, action.open] },
        };
      }

      const openAsks = [...controlled.openAsks, action.open];
      const allowed = action.open ? controlled.allowOpen : controlled.allowClose;
      const open = allowed ? action.open : controlled.open;

      return { ...state, controlled: { ...controlled, openAsks, open } };
    }

    case "active-change-asked": {
      if (action.section === "free") {
        const activeAsks = [...state.free.activeAsks, action.itemId];

        return { ...state, free: { ...state.free, activeAsks } };
      }

      const activeAsks = [...controlled.activeAsks, action.itemId];
      const activeId = controlled.allowActive ? action.itemId : controlled.activeId;

      return { ...state, controlled: { ...controlled, activeAsks, activeId } };
    }

    case "policy-changed":
      return {
        ...state,
        controlled: {
          ...controlled,
          allowOpen: action.allowOpen ?? controlled.allowOpen,
          allowActive: action.allowActive ?? controlled.allowActive,
          allowClose: action.allowClose ?? controlled.allowClose,
        },
      };

    case "parent-opened":
      if (action.section === "openOnly") {
        return { ...state, openOnly: { ...state.openOnly, open: true } };
      }

      return {
        ...state,
        controlled: { ...controlled, open: true, activeId: action.activeId ?? controlled.activeId },
      };

    case "parent-closed":
      return { ...state, controlled: { ...controlled, open: false } };

    case "parent-selected":
      return { ...state, controlled: { ...controlled, activeId: action.activeId } };

    case "items-reversed":
      return withItems(state, action.section, [...state[action.section].items].reverse());

    case "item-removed":
      return withItems(
        state,
        action.section,
        state[action.section].items.filter((item) => item.id !== action.itemId),
      );

    case "items-cleared":
      return withItems(state, action.section, []);
  }
}

export function RootHarness() {
  const [state, dispatch] = useReducer(harnessReducer, initialHarness);
  const { controlled, free, openOnly } = state;

  // The viewer is modal, so tests reach the parent through this rather than page buttons.
  useEffect(() => {
    window.ombraHarness = { dispatch };

    return () => {
      delete window.ombraHarness;
    };
  }, []);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-12 sm:px-8">
      <h1 className="text-2xl text-foreground">OmbraRoot test bench</h1>

      <section data-testid="controlled" className="grid gap-4">
        <h2 className="text-lg text-foreground">Controlled</h2>
        <output
          data-testid="controlled-readout"
          data-open={String(controlled.open)}
          data-active={controlled.activeId ?? ""}
          data-open-asks={JSON.stringify(controlled.openAsks)}
          data-active-asks={JSON.stringify(controlled.activeAsks)}
          className="font-mono text-xs text-foreground/70"
        >
          open {String(controlled.open)}, active {controlled.activeId ?? "none"}
        </output>
        <OmbraGallery
          items={controlled.items}
          engine="fade"
          open={controlled.open}
          onOpenChange={(open) => {
            dispatch({ type: "open-change-asked", section: "controlled", open });
          }}
          activeId={controlled.activeId}
          onActiveIdChange={(itemId) => {
            dispatch({ type: "active-change-asked", section: "controlled", itemId });
          }}
        />
      </section>

      <section data-testid="free" className="grid gap-4">
        <h2 className="text-lg text-foreground">Uncontrolled</h2>
        <output
          data-testid="free-readout"
          data-open-asks={JSON.stringify(free.openAsks)}
          data-active-asks={JSON.stringify(free.activeAsks)}
          className="font-mono text-xs text-foreground/70"
        >
          {free.items.length} items
        </output>
        <OmbraGallery
          items={free.items}
          engine="fade"
          defaultActiveId={initialItems[2]?.id}
          onOpenChange={(open) => {
            dispatch({ type: "open-change-asked", section: "free", open });
          }}
          onActiveIdChange={(itemId) => {
            dispatch({ type: "active-change-asked", section: "free", itemId });
          }}
        />
      </section>

      <section data-testid="open-only" className="grid gap-4">
        <h2 className="text-lg text-foreground">Controlled open, uncontrolled item</h2>
        <output
          data-testid="open-only-readout"
          data-open={String(openOnly.open)}
          data-open-asks={JSON.stringify(openOnly.openAsks)}
          className="font-mono text-xs text-foreground/70"
        >
          open {String(openOnly.open)}
        </output>
        <OmbraGallery
          items={initialItems}
          engine="fade"
          open={openOnly.open}
          onOpenChange={(open) => {
            dispatch({ type: "open-change-asked", section: "openOnly", open });
          }}
        />
      </section>

      <section data-testid="unmatched" className="grid gap-4">
        <h2 className="text-lg text-foreground">Initial item that does not exist</h2>
        {/* Logs a development warning, then starts on the first photo. */}
        <OmbraGallery
          items={initialItems.slice(0, 2)}
          engine="fade"
          defaultActiveId="no-such-photo"
        />
      </section>

      <section data-testid="empty" className="grid gap-4">
        <h2 className="text-lg text-foreground">Empty, asked to open</h2>
        <OmbraGallery items={[]} open />
      </section>
    </main>
  );
}
