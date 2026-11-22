"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { createContext, useContext, useRef } from "react";
import type { ComponentPropsWithRef } from "react";

import { ACTION_CLASSES } from "./ombra-controls";
import { useOptionalOmbraRoot } from "./ombra-root";
import { useOmbraViewer } from "./ombra-viewer";

/** Keep the viewer and Safari's bars on the page's own surface (MAR-105). */
const VIEWER_THEME =
  "[--ombra-surface:var(--color-background,white)] [--ombra-ink:var(--color-foreground,black)]";

/**
 * Runtime values for consumer styles. `--ombra-pull` is the signed pull progress, -1 to 1
 * (negative while the photo is pushed up). It reads the pull's live value on the root, so a
 * drag re-renders nothing.
 */
const PULL_VAR = "[--ombra-pull:var(--ombra-pull-live,0)]";

/** `--ombra-zoom` is the active photo's scale, 1 at its fitted size. The zoom gesture writes it. */
const ZOOM_VAR = "[--ombra-zoom:1]";

export type OmbraPortalProps = ComponentPropsWithRef<typeof Dialog.Portal>;

export type OmbraBackdropProps = ComponentPropsWithRef<typeof Dialog.Backdrop>;

export type OmbraContentProps = ComponentPropsWithRef<typeof Dialog.Popup>;

export type OmbraCloseProps = ComponentPropsWithRef<typeof Dialog.Close>;

function classesFor<State>(
  defaults: string,
  className: string | ((state: State) => string | undefined) | undefined,
) {
  return (state: State) => {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Base UI's public className contract is a string or state callback.
    const custom = typeof className === "function" ? className(state) : className;

    return cn(defaults, custom);
  };
}

type Viewer = ReturnType<typeof useOmbraViewer>;

/** The morph driver's props for the backdrop and content, from the portal that runs it. */
const ViewerContext = createContext<Viewer | null>(null);

function ShellPortal({ className, ...props }: OmbraPortalProps) {
  return (
    <Dialog.Portal data-slot="ombra-portal" {...props} className={classesFor("", className)} />
  );
}

/** Runs the morphs, the pull to dismiss and zoom for the parts inside the portal. */
function ViewerPortal(props: OmbraPortalProps) {
  const viewer = useOmbraViewer();

  return (
    <ViewerContext.Provider value={viewer}>
      {/* Outside the dialog, so a closing view transition still has it. */}
      {viewer.morphStyles}
      <ShellPortal {...props} />
    </ViewerContext.Provider>
  );
}

/**
 * The Base UI portal, including its container and keepMounted options. Inside an
 * `OmbraRoot` it also runs the viewer: one portal per root.
 */
export function OmbraPortal(props: OmbraPortalProps) {
  const root = useOptionalOmbraRoot();

  return root ? <ViewerPortal {...props} /> : <ShellPortal {...props} />;
}

export function OmbraBackdrop({ ref, className, ...props }: OmbraBackdropProps) {
  const viewer = useContext(ViewerContext);

  return useRender({
    ref: [viewer?.backdropProps.ref ?? null, ref ?? null],
    render: (
      <Dialog.Backdrop
        data-slot="ombra-backdrop"
        {...props}
        className={classesFor(
          cn(
            VIEWER_THEME,
            PULL_VAR,
            "fixed inset-0 z-50 touch-pan-x touch-pan-y bg-(--ombra-surface)",
            viewer?.backdropProps.className,
          ),
          className,
        )}
      />
    ),
  });
}

/**
 * A full-viewport shell. Consumers own its header, media, controls and labels. It publishes
 * `--ombra-pull` and `--ombra-zoom` for its descendants' styles; the backdrop has
 * `--ombra-pull` too.
 */
export function OmbraContent({
  ref,
  className,
  initialFocus,
  finalFocus,
  onKeyDown,
  ...props
}: OmbraContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const viewer = useContext(ViewerContext);
  const driven: Partial<Viewer["contentProps"]> = viewer?.contentProps ?? {};

  const {
    ref: viewerRef = null,
    className: viewerClassName,
    finalFocus: viewerFocus,
    onKeyDown: viewerKeyDown,
    ...viewerProps
  } = driven;

  // The caller's handler runs first: preventing a key replaces the viewer's shortcut.
  function keyDown(event: Parameters<NonNullable<OmbraContentProps["onKeyDown"]>>[0]) {
    onKeyDown?.(event);
    viewerKeyDown?.(event);
  }

  function focusClose() {
    const content = contentRef.current;
    const close = content?.querySelector<HTMLElement>("[data-slot=ombra-close]:not(:disabled)");

    // Base UI's default focus used to scroll the page to the portal at its end.
    (close ?? content)?.focus({ preventScroll: true });

    return false;
  }

  // useRender merges the local and caller refs, including React 19 ref cleanups.
  // Dialog.Popup still owns render composition, its state, and native handlers.
  return useRender({
    ref: [contentRef, viewerRef, ref ?? null],
    render: (
      <Dialog.Popup
        data-slot="ombra-content"
        {...viewerProps}
        {...props}
        onKeyDown={keyDown}
        initialFocus={initialFocus === undefined ? focusClose : initialFocus}
        finalFocus={finalFocus === undefined ? viewerFocus : finalFocus}
        className={classesFor(
          cn(
            VIEWER_THEME,
            PULL_VAR,
            ZOOM_VAR,
            // Descendants may narrow pan-x pan-y for their own gesture handling.
            "fixed inset-0 z-50 flex h-dvh w-full touch-pan-x touch-pan-y flex-col overflow-hidden bg-transparent pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-(--ombra-ink) outline-none",
            viewerClassName,
          ),
          className,
        )}
      />
    ),
  });
}

export type OmbraChromeProps = useRender.ComponentProps<"div">;

/**
 * A region of controls a tap on the photo hides, and a second tap shows. While it is
 * hidden it stays in the tab order: focus inside it shows it again. The hiding rules
 * ship in the registry item's CSS, and they fade the region without changing its box,
 * so the photo does not move.
 */
export function OmbraChrome({ ref, className, render, ...props }: OmbraChromeProps) {
  return useRender({
    defaultTagName: "div",
    render,
    ref,
    props: {
      "data-slot": "ombra-chrome",
      ...props,
      className,
    },
  });
}

/** Supply visible text or aria-label in the consumer's language. */
export function OmbraClose({ className, ...props }: OmbraCloseProps) {
  return (
    <Dialog.Close
      data-slot="ombra-close"
      {...props}
      className={classesFor(ACTION_CLASSES, className)}
    />
  );
}
