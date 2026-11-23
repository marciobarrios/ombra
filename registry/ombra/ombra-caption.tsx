"use client";

import { Dialog } from "@base-ui/react/dialog";
import { cn } from "cn";
import type { ComponentPropsWithRef, ReactNode } from "react";

/**
 * One text line. A longer caption is cut with an ellipsis. Overflow stays hidden: a
 * scrollable caption is a region Safari requires to be keyboard-focusable, including
 * the copies on the slides beside the active one.
 */
const CAPTION_CLASSES =
  "box-border h-5 touch-none overflow-hidden px-1 text-center text-sm leading-5 text-ellipsis whitespace-nowrap text-(--ombra-ink)/80";

export type OmbraCaptionProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
  children?: ReactNode;
  /**
   * When true (the default), this caption is the dialog description, so the popup's
   * `aria-describedby` points at it. A second visible copy, such as an inactive slide,
   * passes false: a dialog has one description.
   */
  described?: boolean;
};

/**
 * The active photo's caption. Text or any node. It is the dialog description unless
 * `described` is false, and its box is one line tall so a longer caption is cut
 * instead of pushing the photo or the controls.
 */
export function OmbraCaption({
  className,
  children,
  described = true,
  ...props
}: OmbraCaptionProps) {
  const classes = cn(CAPTION_CLASSES, className);

  if (!described) {
    return (
      <div data-slot="ombra-caption" {...props} className={classes}>
        {children}
      </div>
    );
  }

  return (
    <Dialog.Description render={<div />} data-slot="ombra-caption" {...props} className={classes}>
      {children}
    </Dialog.Description>
  );
}
