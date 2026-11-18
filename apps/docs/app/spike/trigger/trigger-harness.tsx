"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useLayoutEffect, useReducer, useRef } from "react";
import type { ComponentPropsWithRef, Dispatch } from "react";

import {
  OmbraBackdrop,
  OmbraClose,
  OmbraContent,
  OmbraPortal,
} from "../../../../../registry/ombra/ombra-dialog";
import { OmbraRoot, useOmbraRoot } from "../../../../../registry/ombra/ombra-root";
import { OmbraTrigger } from "../../../../../registry/ombra/ombra-trigger";

import { photos } from "../photos";

const items = photos.slice(0, 5);
const ids = items.map((item) => item.id);

type Harness = {
  openAsks: boolean[];
  activeAsks: string[];
  clicks: string[];
  removed: string | null;
  refs: string;
  sources: string;
};

type Action =
  | { type: "open-change-asked"; open: boolean }
  | { type: "active-change-asked"; itemId: string }
  | { type: "trigger-clicked"; name: string }
  | { type: "trigger-removed"; itemId: string }
  | { type: "refs-inspected"; refs: string; sources: string };

function reducer(state: Harness, action: Action): Harness {
  switch (action.type) {
    case "open-change-asked":
      return { ...state, openAsks: [...state.openAsks, action.open] };
    case "active-change-asked":
      return { ...state, activeAsks: [...state.activeAsks, action.itemId] };
    case "trigger-clicked":
      return { ...state, clicks: [...state.clicks, action.name] };
    case "trigger-removed":
      return { ...state, removed: action.itemId };
    case "refs-inspected":
      return { ...state, refs: action.refs, sources: action.sources };
  }
}

/** Stands in for the slides, which will register the items themselves (MAR-140). */
function RegisteredItems() {
  const { registerItem } = useOmbraRoot();

  useLayoutEffect(() => {
    const stops = ids.map((itemId) => registerItem(itemId));

    return () => {
      for (const stop of stops) stop();
    };
  }, [registerItem]);

  return null;
}

/** A consumer component must pass the received props and ref to its DOM node. */
function CardButton(props: ComponentPropsWithRef<"button">) {
  return <button {...props} data-custom-trigger="true" />;
}

function photo(at: number) {
  const item = items[at];

  if (!item) throw new Error(`The bench has no photo ${at}.`);

  return item;
}

function Viewer({
  dispatch,
  inspect,
}: {
  dispatch: Dispatch<Action>;
  inspect: (triggerFor: ReturnType<typeof useOmbraRoot>["triggerFor"]) => void;
}) {
  const root = useOmbraRoot();
  const { activeId } = root.state;
  const at = ids.indexOf(activeId ?? "");

  return (
    <OmbraPortal>
      <OmbraBackdrop />
      <OmbraContent className="inset-8 h-auto w-auto p-4">
        <Dialog.Title>Composed photos</Dialog.Title>
        <output data-testid="active">{activeId}</output>
        <button onClick={() => root.requestActive(ids[(at + 1) % ids.length] ?? "")}>
          Next item
        </button>
        <button
          onClick={() => {
            if (activeId) dispatch({ type: "trigger-removed", itemId: activeId });
          }}
        >
          Remove current trigger
        </button>
        <button onClick={() => inspect(root.triggerFor)}>Inspect sources</button>
        <OmbraClose>Close composed photos</OmbraClose>
      </OmbraContent>
    </OmbraPortal>
  );
}

export function TriggerHarness() {
  const [state, dispatch] = useReducer(reducer, {
    openAsks: [],
    activeAsks: [],
    clicks: [],
    removed: null,
    refs: "",
    sources: "",
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const renderRef = useRef<HTMLButtonElement>(null);
  const mediaRef = useRef<HTMLSpanElement>(null);
  const [road, ridge, third, fourth, fifth] = [0, 1, 2, 3, 4].map(photo);

  function inspect(triggerFor: ReturnType<typeof useOmbraRoot>["triggerFor"]) {
    const custom = triggerFor(ridge.id);
    const media = triggerFor(third.id);
    const plain = triggerFor(road.id);

    dispatch({
      type: "refs-inspected",
      refs: String(
        triggerRef.current !== null &&
          triggerRef.current === renderRef.current &&
          custom?.element === triggerRef.current &&
          triggerRef.current.dataset.customTrigger === "true",
      ),
      sources: [
        plain?.media?.tagName.toLowerCase(),
        media?.media === mediaRef.current ? "media-ref" : "missing",
      ].join(","),
    });
  }

  function clicked(name: string) {
    return () => dispatch({ type: "trigger-clicked", name });
  }

  const removed = (itemId: string) => state.removed === itemId;

  return (
    <main className="grid min-h-[150vh] content-start gap-6 p-8">
      <h1 className="text-2xl text-foreground">OmbraTrigger test bench</h1>
      <output
        data-testid="readout"
        data-open-asks={JSON.stringify(state.openAsks)}
        data-active-asks={JSON.stringify(state.activeAsks)}
        data-clicks={JSON.stringify(state.clicks)}
        data-refs={state.refs}
        data-sources={state.sources}
        className="font-mono text-xs text-foreground/70"
      >
        {state.openAsks.length} open asks
      </output>

      <OmbraRoot
        onOpenChange={(open) => dispatch({ type: "open-change-asked", open })}
        onActiveIdChange={(itemId) => dispatch({ type: "active-change-asked", itemId })}
      >
        <RegisteredItems />
        <div className="grid max-w-xl grid-cols-3 gap-3">
          {removed(road.id) ? null : (
            <OmbraTrigger itemId={road.id} onClick={clicked("plain")} className="block">
              <img src={road.thumbSrc} alt={road.alt} className="aspect-square object-cover" />
            </OmbraTrigger>
          )}
          {removed(ridge.id) ? null : (
            <OmbraTrigger
              itemId={ridge.id}
              ref={triggerRef}
              aria-label={ridge.alt}
              data-testid="custom"
              onClick={clicked("custom")}
              render={<CardButton ref={renderRef} onClick={clicked("render")} />}
            >
              Custom card
            </OmbraTrigger>
          )}
          {removed(third.id) ? null : (
            <OmbraTrigger itemId={third.id} mediaRef={mediaRef} aria-label={third.alt}>
              <span
                ref={mediaRef}
                className="block aspect-square bg-cover"
                style={{ backgroundImage: `url(${third.thumbSrc})` }}
              />
            </OmbraTrigger>
          )}
          <OmbraTrigger itemId={fourth.id} disabled aria-label={fourth.alt}>
            Disabled
          </OmbraTrigger>
          <OmbraTrigger
            itemId={fifth.id}
            aria-label={fifth.alt}
            onClick={(event) => {
              clicked("cancel")();
              event.preventBaseUIHandler();
            }}
          >
            Cancelled
          </OmbraTrigger>
        </div>
        <Viewer dispatch={dispatch} inspect={inspect} />
      </OmbraRoot>
    </main>
  );
}
