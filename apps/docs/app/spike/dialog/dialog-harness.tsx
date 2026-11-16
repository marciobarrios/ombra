"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useCallback, useReducer, useRef } from "react";
import type { ComponentPropsWithRef } from "react";

import {
  OmbraBackdrop,
  OmbraClose,
  OmbraContent,
  OmbraPortal,
} from "../../../../../registry/ombra/ombra-dialog";
import { nameSharedElement } from "../../../../../registry/ombra/morph";
import { usePull } from "../../../../../registry/ombra/use-pull";

/** A consumer component must pass received props and ref to its actual DOM node. */
function Surface(props: ComponentPropsWithRef<"div">) {
  return <div {...props} data-custom-surface="true" />;
}

function CloseButton(props: ComponentPropsWithRef<"button">) {
  return <button {...props} data-custom-close="true" />;
}

type Harness = {
  open: boolean;
  content: HTMLDivElement | null;
  clicks: number;
  renderClicks: number;
  preventClose: boolean;
  refsMatch: boolean;
};

type Action =
  | { type: "open-change-requested"; open: boolean }
  | { type: "content-bound"; node: HTMLDivElement | null }
  | { type: "close-clicked" }
  | { type: "render-clicked" }
  | { type: "close-policy-changed" }
  | { type: "refs-inspected"; match: boolean };

function reducer(state: Harness, action: Action): Harness {
  switch (action.type) {
    case "open-change-requested":
      return { ...state, open: action.open };
    case "content-bound":
      return state.content === action.node ? state : { ...state, content: action.node };
    case "close-clicked":
      return { ...state, clicks: state.clicks + 1 };
    case "render-clicked":
      return { ...state, renderClicks: state.renderClicks + 1 };
    case "close-policy-changed":
      return { ...state, preventClose: !state.preventClose };
    case "refs-inspected":
      return { ...state, refsMatch: action.match };
  }
}

export function DialogHarness() {
  const [state, dispatch] = useReducer(reducer, {
    open: false,
    content: null,
    clicks: 0,
    renderClicks: 0,
    preventClose: false,
    refsMatch: false,
  });

  const contentRef = useRef<HTMLDivElement>(null);
  const renderContentRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const renderPortalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const renderCloseRef = useRef<HTMLButtonElement>(null);
  const readyRef = useRef(true);

  const bindContent = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    dispatch({ type: "content-bound", node });
  }, []);

  const pulling = usePull(state.content, state.open, false, readyRef, false, false, false, () =>
    dispatch({ type: "open-change-requested", open: false }),
  );

  function inspectTargets() {
    const content = contentRef.current;
    const hero = content?.querySelector<HTMLElement>("[data-slot=ombra-image]");

    nameSharedElement(hero);
    dispatch({
      type: "refs-inspected",
      match:
        content !== null &&
        content === renderContentRef.current &&
        portalRef.current === renderPortalRef.current &&
        backdropRef.current?.dataset.slot === "ombra-backdrop" &&
        closeRef.current === renderCloseRef.current &&
        closeRef.current?.closest("[data-slot=ombra-content]") === content,
    });
  }

  return (
    <main className="min-h-[180vh] p-8">
      <h1>Dialog shell contract</h1>
      <output data-testid="events">{`${state.clicks}/${state.renderClicks}`}</output>
      <output data-testid="refs">{String(state.refsMatch)}</output>
      <button onClick={() => dispatch({ type: "close-policy-changed" })}>
        {state.preventClose ? "Allow close" : "Prevent close"}
      </button>
      <div className="h-[65vh]" />
      <Dialog.Root
        open={state.open}
        onOpenChange={(open) => dispatch({ type: "open-change-requested", open })}
      >
        <Dialog.Trigger>Open custom shell</Dialog.Trigger>
        <OmbraPortal
          ref={portalRef}
          className="custom-portal"
          render={<Surface ref={renderPortalRef} />}
        >
          <OmbraBackdrop
            ref={backdropRef}
            className={(part) => (part.open ? "custom-backdrop" : "")}
            render={(props, part) => <Surface {...props} data-render-open={String(part.open)} />}
          />
          <OmbraContent
            ref={bindContent}
            aria-label="Fotografías de viaje"
            data-pulling={String(pulling)}
            className="inset-8 h-auto w-auto bg-(--ombra-surface) p-4"
            render={<Surface ref={renderContentRef} />}
          >
            <button onClick={inspectTargets}>Inspect targets</button>
            <div data-slot="ombra-sheet" className="min-h-0 flex-1">
              <div data-slot="ombra-image" className="h-24 w-24 bg-foreground/10">
                Media target
              </div>
            </div>
            <OmbraClose
              ref={closeRef}
              className="w-auto"
              onClick={(event) => {
                dispatch({ type: "close-clicked" });

                if (state.preventClose) event.preventBaseUIHandler();
              }}
              render={
                <CloseButton
                  ref={renderCloseRef}
                  onClick={() => dispatch({ type: "render-clicked" })}
                />
              }
            >
              Cerrar fotos
            </OmbraClose>
          </OmbraContent>
        </OmbraPortal>
      </Dialog.Root>
    </main>
  );
}
