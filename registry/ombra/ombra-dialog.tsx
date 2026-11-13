"use client";

// Spike (dialog comparison): one surface over Base UI Dialog and UI SDK Dialog so the
// gallery can run on either. Only the parts and behaviour the gallery uses are covered.

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import {
  Dialog as SdkDialog,
  DialogBackdrop as SdkBackdrop,
  DialogContent as SdkContent,
  DialogDescription as SdkDescription,
  DialogTitle as SdkTitle,
} from "@ui-sdk/react/dialog";
import { cn } from "cn";
import { createContext, useContext } from "react";
import type { ComponentProps, KeyboardEventHandler, ReactNode, Ref, RefObject } from "react";

import type { DialogKit } from "./types";

const KitContext = createContext<{ kit: DialogKit; onDismiss: () => void }>({
  kit: "base-ui",
  onDismiss: () => undefined,
});

// UI SDK shows its parts as `popover="manual"` in the top layer. The UA popover styles
// (fit-content size, auto margin, border, padding, Canvas background) must go.
//
// UI SDK also owns `data-slot` on its parts (`dialog-content`, ...) and uses it to tell
// its own events apart, so Ombra's slots cannot replace it. Each Ombra element sits
// inside the UI SDK part instead. The shell lets pointers through so a closing viewer
// (`pointer-events: none` on the Ombra element) does not block the page.
const TOP_LAYER_SHELL =
  "pointer-events-none fixed inset-0 m-0 size-full max-h-none max-w-none overflow-visible border-0 bg-transparent p-0 text-inherit outline-none";

export type DialogActions = { unmount: () => void; close: () => void } | null;

export function OmbraDialog({
  kit,
  open,
  modal,
  actionsRef,
  onDismiss,
  children,
}: {
  kit: DialogKit;
  open: boolean;
  modal: boolean;
  actionsRef: RefObject<DialogActions>;
  /** Escape, outside press, or a Close part. The gallery runs its own close animation. */
  onDismiss: () => void;
  children: ReactNode;
}) {
  if (kit === "ui-sdk") {
    return (
      <KitContext.Provider value={{ kit, onDismiss }}>
        <SdkDialog
          open={open}
          modal={modal}
          onOpenChange={(next, details) => {
            if (next) return;

            // Keep it open: the gallery closes it once its morph lands.
            details.cancel();
            onDismiss();
          }}
        >
          {children}
        </SdkDialog>
      </KitContext.Provider>
    );
  }

  return (
    <KitContext.Provider value={{ kit, onDismiss }}>
      <BaseDialog.Root
        open={open}
        modal={modal}
        actionsRef={actionsRef}
        onOpenChange={(next, details) => {
          if (next) return;

          details.preventUnmountOnClose();
          onDismiss();
        }}
      >
        <BaseDialog.Portal>{children}</BaseDialog.Portal>
      </BaseDialog.Root>
    </KitContext.Provider>
  );
}

export function OmbraDialogBackdrop({
  ref,
  className,
  ...props
}: {
  ref?: Ref<HTMLDivElement>;
  className?: string;
  "data-slot"?: string;
}) {
  const { kit } = useContext(KitContext);

  if (kit === "ui-sdk") {
    return (
      <SdkBackdrop className={TOP_LAYER_SHELL}>
        <div ref={ref} className={cn("pointer-events-auto", className)} {...props} />
      </SdkBackdrop>
    );
  }

  return <BaseDialog.Backdrop ref={ref} className={className} {...props} />;
}

type PopupProps = {
  ref?: Ref<HTMLDivElement>;
  className?: string;
  children: ReactNode;
  initialFocus: RefObject<HTMLElement | null>;
  finalFocus: () => HTMLElement | null;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  [data: `data-${string}`]: string | undefined;
};

export function OmbraDialogPopup({
  ref,
  className,
  initialFocus,
  finalFocus,
  ...props
}: PopupProps) {
  const { kit } = useContext(KitContext);

  if (kit === "ui-sdk") {
    return (
      <SdkContent
        initialFocus={() => initialFocus.current}
        finalFocus={() => finalFocus()}
        className={TOP_LAYER_SHELL}
        // UI SDK falls back to focusing its content part, as on a Safari click that
        // focuses nothing. That part is now the shell, outside the viewer's key
        // handling, so focus moves on to the viewer.
        onFocus={(event) => {
          if (event.target !== event.currentTarget) return;

          const viewer = event.currentTarget.firstElementChild;

          if (viewer instanceof HTMLElement) viewer.focus({ preventScroll: true });
        }}
      >
        <div ref={ref} tabIndex={-1} className={cn("pointer-events-auto", className)} {...props} />
      </SdkContent>
    );
  }

  return (
    <BaseDialog.Popup
      ref={ref}
      initialFocus={initialFocus}
      finalFocus={() => finalFocus() ?? true}
      className={className}
      {...props}
    />
  );
}

export function OmbraDialogTitle(props: { className?: string; children: ReactNode }) {
  return useContext(KitContext).kit === "ui-sdk" ? (
    <SdkTitle {...props} />
  ) : (
    <BaseDialog.Title {...props} />
  );
}

export function OmbraDialogDescription(props: { className?: string; children: ReactNode }) {
  return useContext(KitContext).kit === "ui-sdk" ? (
    <SdkDescription {...props} />
  ) : (
    <BaseDialog.Description {...props} />
  );
}

export function OmbraDialogClose(
  props: Omit<ComponentProps<"button">, "ref" | "value"> & { ref?: Ref<HTMLButtonElement> },
) {
  const { kit, onDismiss } = useContext(KitContext);

  // A UI SDK Close part would rename the slot, and the gallery vetoes its close anyway.
  if (kit === "ui-sdk") return <button type="button" onClick={onDismiss} {...props} />;

  return <BaseDialog.Close {...props} />;
}
