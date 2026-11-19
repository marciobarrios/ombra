"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { useRef } from "react";
import type { ComponentPropsWithRef } from "react";

/** Keep the viewer and Safari's bars on the page's own surface (MAR-105). */
const VIEWER_THEME =
  "[--ombra-surface:var(--color-background,white)] [--ombra-ink:var(--color-foreground,black)]";

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

/** The Base UI portal, including its container and keepMounted options. */
export function OmbraPortal({ className, ...props }: OmbraPortalProps) {
  return (
    <Dialog.Portal data-slot="ombra-portal" {...props} className={classesFor("", className)} />
  );
}

export function OmbraBackdrop({ className, ...props }: OmbraBackdropProps) {
  return (
    <Dialog.Backdrop
      data-slot="ombra-backdrop"
      {...props}
      className={classesFor(
        cn(VIEWER_THEME, "fixed inset-0 z-50 touch-pan-x touch-pan-y bg-(--ombra-surface)"),
        className,
      )}
    />
  );
}

/** A full-viewport shell. Consumers own its header, media, controls and labels. */
export function OmbraContent({ ref, className, initialFocus, ...props }: OmbraContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

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
    ref: [contentRef, ref ?? null],
    render: (
      <Dialog.Popup
        data-slot="ombra-content"
        {...props}
        initialFocus={initialFocus === undefined ? focusClose : initialFocus}
        className={classesFor(
          cn(
            VIEWER_THEME,
            // Descendants may narrow pan-x pan-y for their own gesture handling.
            "fixed inset-0 z-50 flex h-dvh w-full touch-pan-x touch-pan-y flex-col overflow-hidden bg-transparent pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-(--ombra-ink) outline-none",
          ),
          className,
        )}
      />
    ),
  });
}

/**
 * The viewer's round action buttons. Repeated taps must not invoke Safari's native
 * double-tap zoom, so they set `touch-action: manipulation`.
 */
export const ACTION_CLASSES =
  "inline-flex size-11 touch-manipulation items-center justify-center rounded-full text-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-30";

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
