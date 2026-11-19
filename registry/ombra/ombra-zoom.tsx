"use client";

import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { useCallback, useSyncExternalStore } from "react";

import { useOmbraAction } from "./ombra-controls";
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

/** Whether the active item has a zoom surface and, with `zoomedOnly`, is zoomed too. */
function useCanZoom(zoomedOnly: boolean): boolean {
  const { state, subscribeZoom, zoomFor, zoomControlsRef } = useOmbraRoot();
  const { activeId } = state;

  return useSyncExternalStore(
    subscribeZoom,
    () =>
      activeId !== null &&
      zoomFor(activeId) !== null &&
      (!zoomedOnly || (zoomControlsRef.current?.zoomed() ?? false)),
    () => false,
  );
}

/**
 * Zooms the active photo in one step. Disabled while the active slide has no `OmbraZoom`.
 * Supply visible text or `aria-label` in the consumer's language.
 */
export function OmbraZoomIn(props: OmbraZoomActionProps) {
  const { zoomControlsRef } = useOmbraRoot();

  return useOmbraAction(
    {
      slot: "ombra-zoom-in",
      disabled: !useCanZoom(false),
      onPress: () => zoomControlsRef.current?.zoomIn(),
    },
    props,
  );
}

/**
 * Zooms the active photo out one step. Disabled while it rests at its fitted size.
 * Supply visible text or `aria-label` in the consumer's language.
 */
export function OmbraZoomOut(props: OmbraZoomActionProps) {
  const { zoomControlsRef } = useOmbraRoot();

  return useOmbraAction(
    {
      slot: "ombra-zoom-out",
      disabled: !useCanZoom(true),
      onPress: () => zoomControlsRef.current?.zoomOut(),
    },
    props,
  );
}
