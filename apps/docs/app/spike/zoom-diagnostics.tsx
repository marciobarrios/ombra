"use client";

import { useEffect, useRef } from "react";

const MAX_SAMPLES = 1200;
const SAMPLE_INTERVAL_MS = 100;

function box(element: Element | null) {
  if (!element) return null;

  const { x, y, width, height } = element.getBoundingClientRect();

  return { x, y, width, height };
}

function measure(reason: string, event?: PointerEvent | MouseEvent) {
  const viewer = document.querySelector<HTMLElement>("[data-slot=ombra-viewer]");
  const track = viewer?.querySelector<HTMLElement>("[data-slot=ombra-track]");
  const sheet = viewer?.querySelector<HTMLElement>("[data-slot=ombra-sheet]");

  const layer = viewer?.querySelector<HTMLElement>(
    "[data-slot=ombra-slide][data-active=true] [data-slot=ombra-zoom]",
  );

  const viewport = window.visualViewport;
  const target = event?.target;

  return {
    t: performance.now(),
    reason,
    pointer: event
      ? {
          type: event instanceof PointerEvent ? event.pointerType : "mouse",
          id: event instanceof PointerEvent ? event.pointerId : null,
          x: event.clientX,
          y: event.clientY,
          target:
            target instanceof Element
              ? target.closest("[data-slot]")?.getAttribute("data-slot")
              : null,
          trusted: event.isTrusted,
        }
      : null,
    viewport: viewport
      ? {
          scale: viewport.scale,
          offsetLeft: viewport.offsetLeft,
          offsetTop: viewport.offsetTop,
          pageLeft: viewport.pageLeft,
          pageTop: viewport.pageTop,
          width: viewport.width,
          height: viewport.height,
        }
      : null,
    layout: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    viewer: viewer
      ? {
          engine: viewer.dataset.engine,
          phase: viewer.dataset.phase,
          zoomed: viewer.dataset.zoomed,
          pulling: viewer.dataset.pulling,
          box: box(viewer),
          header: box(viewer.querySelector("header")),
          close: box(viewer.querySelector("[data-slot=ombra-close]")),
          zoomOut: box(viewer.querySelector("[data-slot=ombra-zoom-out]")),
          zoomIn: box(viewer.querySelector("[data-slot=ombra-zoom-in]")),
          counter: viewer.querySelector("[data-slot=ombra-counter]")?.textContent,
          transform: layer ? getComputedStyle(layer).transform : null,
          sheetTransform: sheet ? getComputedStyle(sheet).transform : null,
          trackTouchAction: track ? getComputedStyle(track).touchAction : null,
          trackScrollLeft: track?.scrollLeft,
        }
      : null,
  };
}

type ZoomSample = ReturnType<typeof measure>;

declare global {
  interface Window {
    ombraZoomDiagnostics?: { download: () => void };
  }
}

export function ZoomDiagnostics() {
  const samples = useRef<ZoomSample[]>([]);

  function download() {
    const blob = new Blob(
      [JSON.stringify({ userAgent: navigator.userAgent, samples: samples.current }, null, 2)],
      { type: "application/json" },
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "ombra-zoom-diagnostics.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  useEffect(() => {
    const record = (reason: string, event?: PointerEvent | MouseEvent) => {
      samples.current.push(measure(reason, event));

      if (samples.current.length > MAX_SAMPLES) samples.current.shift();
    };

    let lastMove = 0;
    let frame = 0;

    const onPointer = (event: PointerEvent) => {
      if (!document.querySelector("[data-slot=ombra-viewer]")) return;

      if (event.type === "pointermove") {
        if (event.timeStamp - lastMove < SAMPLE_INTERVAL_MS) return;

        lastMove = event.timeStamp;
      }

      record(event.type, event);
    };

    const onClick = (event: MouseEvent) => {
      record(event.type, event);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => record("after-click"));
    };

    const onResize = () => record("window-resize");
    const onViewport = (event: Event) => record(`visual-viewport-${event.type}`);

    const interval = window.setInterval(() => {
      if (document.querySelector("[data-slot=ombra-viewer]")) record("sample");
    }, SAMPLE_INTERVAL_MS);

    const pointerEvents = ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const;

    for (const name of pointerEvents) document.addEventListener(name, onPointer, { passive: true });

    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onClick, true);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("scroll", onViewport);
    const api = { download };

    window.ombraZoomDiagnostics = api;
    record("start");

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(frame);

      for (const name of pointerEvents) document.removeEventListener(name, onPointer);

      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onClick, true);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("scroll", onViewport);

      if (window.ombraZoomDiagnostics === api) delete window.ombraZoomDiagnostics;
    };
  }, []);

  return (
    <p className="mt-4 text-sm text-foreground/80">
      Zoom diagnostics are recording locally. Close the viewer, then{" "}
      <button type="button" className="min-h-11 touch-manipulation underline" onClick={download}>
        Download zoom diagnostics
      </button>
      . Reloading clears the recording.
    </p>
  );
}
