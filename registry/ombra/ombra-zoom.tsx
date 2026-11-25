"use client";

import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { useCallback, useSyncExternalStore } from "react";

import { useOmbraAction } from "./ombra-controls";
import type { OmbraActionProps } from "./ombra-controls";
import { useOmbraRoot } from "./ombra-root";
import { useSlideItem } from "./ombra-slides";

export type OmbraZoomProps = useRender.ComponentProps<"div"> & {
  /**
   * The largest scale, relative to the fitted media. Without it, zoom stops where the media
   * shows at its natural size (the `width` given to `OmbraMedia`), and media that already
   * fits at that size does not zoom.
   */
  maxScale?: number;
};

export type OmbraZoomActionProps = OmbraActionProps;

/**
 * Makes its slide's media zoomable: pinch, double-tap, ctrl+wheel, trackpad pinch and the
 * `+`, `-` and `0` keys. A slide without it does not zoom, and its gestures stay with the
 * track and the pull. Wrap the `OmbraMedia`: zooming scales this surface, never the media's
 * resting box, so the morph still lands where the media rests. The first zoom past the
 * fitted size raises the `sizes` of each `img` with a `srcset` inside, so the browser fetches
 * a sharper candidate.
 */
export function OmbraZoom({ maxScale, ref, className, render, ...props }: OmbraZoomProps) {
  const itemId = useSlideItem("OmbraZoom");
  const { registerZoom } = useOmbraRoot();

  const register = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;

      return registerZoom({ itemId, element, maxScale });
    },
    [itemId, maxScale, registerZoom],
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

/**
 * Returns the active photo to its fitted size. Disabled while it already rests there,
 * or the active slide has no `OmbraZoom`. Supply visible text or `aria-label` in the
 * consumer's language.
 */
export function OmbraZoomReset(props: OmbraZoomActionProps) {
  const { zoomControlsRef } = useOmbraRoot();

  return useOmbraAction(
    {
      slot: "ombra-zoom-reset",
      disabled: !useCanZoom(true),
      onPress: () => zoomControlsRef.current?.home(),
    },
    props,
  );
}
