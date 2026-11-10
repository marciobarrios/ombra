"use client";

import { type RefObject, useLayoutEffect } from "react";

const FIT_PROPERTIES = ["left", "top", "width", "height"] as const;

/**
 * `position: fixed` follows the layout viewport, so a page zoomed before
 * opening would leave part of the viewer off-screen. Pin the popup to the
 * visual viewport instead. The backdrop stays on the layout viewport, which
 * also covers what iOS Safari shows under its bars. Also call it when the
 * popup mounts: the dialog portal can mount after the guard's effect runs.
 */
export function fitToVisualViewport(node: HTMLElement) {
  const viewport = window.visualViewport;

  if (!viewport || viewport.scale <= 1.001) {
    for (const property of FIT_PROPERTIES) node.style.removeProperty(property);

    return;
  }

  node.style.left = `${viewport.offsetLeft}px`;
  node.style.top = `${viewport.offsetTop}px`;
  node.style.width = `${viewport.width}px`;
  node.style.height = `${viewport.height}px`;
}

/**
 * Keeps the page under an open viewer from zooming, and keeps the viewer on
 * the visible area when the page was already pinch-zoomed before it opened.
 *
 * `touch-action` on the viewer stops touch pinch in browsers that honour it.
 * Safari also starts page zoom from its own gesture events (iOS touch pinch,
 * macOS trackpad pinch), and Chromium and Firefox turn a trackpad pinch into
 * ctrl+wheel. Both are cancelled while `active` and released after close, so
 * the page stays zoomable. The viewport meta tag is left alone.
 */
export function usePageZoomGuard(active: boolean, popupRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (!active) return;

    const cancel = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };

    const cancelPinchWheel = (event: WheelEvent) => {
      if (event.ctrlKey && event.cancelable) event.preventDefault();
    };

    const options = { capture: true, passive: false } as const;

    document.addEventListener("gesturestart", cancel, options);
    document.addEventListener("gesturechange", cancel, options);
    document.addEventListener("gestureend", cancel, options);
    window.addEventListener("wheel", cancelPinchWheel, options);

    const viewport = window.visualViewport;

    // Pinch is blocked while open, so this only follows the visual viewport's pan.
    const fit = () => {
      if (popupRef.current) fitToVisualViewport(popupRef.current);
    };

    fit();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);

    return () => {
      document.removeEventListener("gesturestart", cancel, options);
      document.removeEventListener("gesturechange", cancel, options);
      document.removeEventListener("gestureend", cancel, options);
      window.removeEventListener("wheel", cancelPinchWheel, options);
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);

      const node = popupRef.current;

      if (node) for (const property of FIT_PROPERTIES) node.style.removeProperty(property);
    };
  }, [active, popupRef]);
}
