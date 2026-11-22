"use client";

import { useRef } from "react";

import { useZoom } from "@/components/ombra/use-zoom";

export function ZoomedPhoto() {
  const track = useRef<HTMLElement>(null);
  const layer = useRef<HTMLElement>(null);
  const gesture = useRef(false);
  const zoom = useZoom(track, layer, true, () => {}, false, false, false, gesture);

  return (
    <div
      ref={(node) => {
        track.current = node;
      }}
    >
      <div
        ref={(node) => {
          layer.current = node;
        }}
      >
        {zoom.zoomed ? "Zoomed" : "Fit"}
      </div>
    </div>
  );
}
