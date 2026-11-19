"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { useCallback, useSyncExternalStore } from "react";

import { useOmbraRoot } from "./ombra-root";
import { useSlideItem } from "./ombra-slides";

export type OmbraZoomProps = useRender.ComponentProps<"div">;

export type OmbraZoomActionProps = useRender.ComponentProps<"button">;

/**
 * Makes its slide's media zoomable: pinch, double-tap, ctrl+wheel, trackpad pinch and the
 * `+`, `-` and `0` keys. A slide without it does not zoom, and its gestures stay with the
 * track and the pull. Wrap the `OmbraMedia`: zooming scales this surface, never the media's
 * resting box, so the morph still lands where the media rests.
 */
export function OmbraZoom({ ref, className, render, ...props }: OmbraZoomProps) {
  const itemId = useSlideItem("OmbraZoom");
  const { registerZoom } = useOmbraRoot();

  const register = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;

      return registerZoom({ itemId, element });
    },
    [itemId, registerZoom],
  );

  // useRender merges the local and caller refs, including React 19 ref cleanups.
  return useRender({
    render,
    ref: [register, ref ?? null],
    props: {
      "data-slot": "ombra-zoom",
      ...props,
      className: cn(
        // Keeps Safari's native double-tap zoom off the photo. The track still owns
        // horizontal scrolling.
        "flex h-full min-h-0 w-full min-w-0 touch-manipulation items-center justify-center",
        className,
      ),
    },
  });
}

/** Whether the active item has a zoom surface, and whether it is zoomed. */
function useZoomState() {
  const { state, subscribeZoom, zoomFor, zoomControlsRef } = useOmbraRoot();
  const { activeId } = state;

  const zoomable = useSyncExternalStore(
    subscribeZoom,
    () => activeId !== null && zoomFor(activeId) !== null,
    () => false,
  );

  const zoomed = useSyncExternalStore(
    subscribeZoom,
    () => zoomControlsRef.current?.zoomed() ?? false,
    () => false,
  );

  return { zoomable, zoomed, controls: zoomControlsRef };
}

const ACTION =
  // Repeated taps must not invoke Safari's native double-tap zoom.
  "inline-flex size-11 touch-manipulation items-center justify-center rounded-full text-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-30";

function useZoomAction(
  slot: "ombra-zoom-in" | "ombra-zoom-out",
  disabled: boolean,
  onPress: () => void,
  { ref, className, render, disabled: disabledProp, ...props }: OmbraZoomActionProps,
) {
  const off = disabled || disabledProp === true;

  return useRender({
    defaultTagName: "button",
    render,
    ref,
    props: {
      "data-slot": slot,
      "data-disabled": off ? "" : undefined,
      // The caller's handler runs first, and may call `event.preventBaseUIHandler()`.
      ...mergeProps<"button">({ type: "button", onClick: onPress }, props, {
        disabled: off,
        className: cn(ACTION, className),
      }),
    },
  });
}

/**
 * Zooms the active photo in one step. Disabled while the active slide has no `OmbraZoom`.
 * Supply visible text or `aria-label` in the consumer's language.
 */
export function OmbraZoomIn(props: OmbraZoomActionProps) {
  const { zoomable, controls } = useZoomState();

  return useZoomAction("ombra-zoom-in", !zoomable, () => controls.current?.zoomIn(), props);
}

/**
 * Zooms the active photo out one step. Disabled while it rests at its fitted size.
 * Supply visible text or `aria-label` in the consumer's language.
 */
export function OmbraZoomOut(props: OmbraZoomActionProps) {
  const { zoomable, zoomed, controls } = useZoomState();

  return useZoomAction(
    "ombra-zoom-out",
    !zoomable || !zoomed,
    () => controls.current?.zoomOut(),
    props,
  );
}
