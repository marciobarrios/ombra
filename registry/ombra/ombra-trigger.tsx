"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useRender } from "@base-ui/react/use-render";
import { useCallback } from "react";
import type { ComponentPropsWithRef, RefObject } from "react";

import { useOmbraRoot } from "./ombra-root";

export type OmbraTriggerProps = Omit<
  ComponentPropsWithRef<typeof Dialog.Trigger>,
  "handle" | "payload"
> & {
  /** The item this trigger opens. It matches the item's stable ID, not its position. */
  itemId: string;
  /**
   * The thumbnail the open morph flies from and the close morph lands on. Defaults to the
   * first `<img>` inside the trigger; pass a ref for other markup, such as a picture or a
   * background-image element.
   */
  mediaRef?: RefObject<HTMLElement | null>;
};

/**
 * Opens its item. Base UI's `Dialog.Trigger` supplies the button semantics, disabled
 * handling, `aria-haspopup`, `aria-expanded` and `aria-controls`; the root decides whether
 * the press opens, so a controlled parent can refuse it. A handler that calls
 * `event.preventBaseUIHandler()` cancels the open.
 */
export function OmbraTrigger({ itemId, mediaRef, ref, ...props }: OmbraTriggerProps) {
  const { registerTrigger } = useOmbraRoot();

  const register = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;

      return registerTrigger({ itemId, element, media: () => mediaRef?.current ?? null });
    },
    [itemId, mediaRef, registerTrigger],
  );

  // useRender merges the local and caller refs, including React 19 ref cleanups.
  return useRender({
    ref: [register, ref ?? null],
    render: <Dialog.Trigger data-slot="ombra-trigger" {...props} />,
  });
}
