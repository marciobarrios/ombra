"use client";

import { useEffect, useState } from "react";

import { OmbraGallery } from "../../../../registry/ombra/ombra-gallery";
import type { MorphEngine } from "../../../../registry/ombra/types";

import { photos } from "./photos";
import { ZoomDiagnostics } from "./zoom-diagnostics";

export function SpikeApp({
  initialEngine,
  initialSlow,
  initialSpring,
  debugZoom,
}: {
  initialEngine: MorphEngine;
  initialSlow: boolean;
  initialSpring: boolean;
  debugZoom: boolean;
}) {
  const [engine, setEngine] = useState(initialEngine);
  const [slow, setSlow] = useState(initialSlow);
  const [spring, setSpring] = useState(initialSpring);

  useEffect(() => {
    const url = new URL(window.location.href);

    url.searchParams.set("engine", engine);

    if (slow) url.searchParams.set("slow", "1");
    else url.searchParams.delete("slow");

    if (spring) url.searchParams.set("spring", "1");
    else url.searchParams.delete("spring");

    window.history.replaceState(null, "", url);
  }, [engine, slow, spring]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-8 sm:py-16">
      <p className="font-display text-sm tracking-[0.22em] text-brand">OMBRA</p>
      <h1 className="font-display mt-3 max-w-xl text-5xl leading-none text-foreground sm:text-7xl">
        A shadow of the picture.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-foreground/80">
        Open a photograph. It should leave its place in the grid and come back to the same one.
        Switch the morph engine, including from the address bar, and watch the frame-time readout.
        Nothing here is the final component API.
      </p>
      {reducedNote()}
      {debugZoom && <ZoomDiagnostics />}
      <div className="mt-12">
        <OmbraGallery
          items={photos}
          engine={engine}
          slow={slow}
          spring={spring}
          onEngineChange={setEngine}
          onSlowChange={setSlow}
          onSpringChange={setSpring}
        />
      </div>
    </main>
  );
}

function reducedNote() {
  return (
    <p className="mt-4 max-w-xl text-sm leading-6 text-foreground/70">
      Add <span className="font-mono">?engine=vt</span>, <span className="font-mono">flip</span>, or{" "}
      <span className="font-mono">fade</span>, <span className="font-mono">?slow=1</span>, and{" "}
      <span className="font-mono">?spring=1</span> to inspect. When the system asks for reduced
      motion, movement falls back to a fade.
    </p>
  );
}
