"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef } from "react";

import { OmbraGallery } from "../../../../registry/ombra/ombra-gallery";
import { OmbraDiagnostics } from "../../../../registry/ombra/ombra-viewer";
import type { MorphEngine } from "../../../../registry/ombra/types";
import { useReducedMotion } from "../../../../registry/ombra/use-reduced-motion";

import { Bench } from "./bench";
import type { BenchSampleListener } from "./bench";

import { frameReadoutReducer, initialFrameReadout } from "./frame-readout";
import { photos, spikePhotos } from "./photos";
import { SpikeControls } from "./spike-controls";
import { ZoomDiagnostics } from "./zoom-diagnostics";

type Settings = { engine: MorphEngine; slow: boolean; spring: boolean };

type SettingsAction =
  | { type: "engine-changed"; engine: MorphEngine }
  | { type: "slow-changed"; slow: boolean }
  | { type: "spring-changed"; spring: boolean };

function settingsReducer(state: Settings, action: SettingsAction): Settings {
  switch (action.type) {
    case "engine-changed":
      return state.engine === action.engine ? state : { ...state, engine: action.engine };

    case "slow-changed":
      return state.slow === action.slow ? state : { ...state, slow: action.slow };

    case "spring-changed":
      return state.spring === action.spring ? state : { ...state, spring: action.spring };
  }
}

export function SpikeApp({
  initialEngine,
  initialSlow,
  initialSpring,
  debugZoom,
  benchRuns,
  photoCount,
}: {
  initialEngine: MorphEngine;
  initialSlow: boolean;
  initialSpring: boolean;
  debugZoom: boolean;
  /** Runs per engine for the `?bench=1` benchmark, or null when it is off. */
  benchRuns: number | null;
  /** How many photos `?photos=` asks for, or null for the whole set. */
  photoCount: number | null;
}) {
  const [{ engine, slow, spring }, dispatch] = useReducer(settingsReducer, {
    engine: initialEngine,
    slow: initialSlow,
    spring: initialSpring,
  });

  const setEngine = (next: MorphEngine) => {
    dispatch({ type: "engine-changed", engine: next });
  };

  const [readout, sendReadout] = useReducer(frameReadoutReducer, initialFrameReadout);
  const reduced = useReducedMotion();
  const effectiveEngine: MorphEngine = reduced ? "fade" : engine;
  // Tallies start over when any of these change, so each test row starts at zero.
  const readoutCondition = `${effectiveEngine}|${slow}|${spring}`;
  const readoutConditionRef = useRef(readoutCondition);

  readoutConditionRef.current = readoutCondition;

  const items = useMemo(
    () => (photoCount === null ? photos : spikePhotos(photoCount)),
    [photoCount],
  );

  const benchListener = useRef<BenchSampleListener | null>(null);

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
        The pass bar is the{" "}
        <Link href="/performance" className="underline-offset-4 hover:underline">
          performance budget
        </Link>
        . Nothing here is the final component API.
      </p>
      {reducedNote()}
      {debugZoom && <ZoomDiagnostics />}
      {benchRuns !== null && (
        <Bench
          runs={benchRuns}
          setEngine={setEngine}
          listen={(listener) => {
            benchListener.current = listener;
          }}
        />
      )}
      <div className="mt-12">
        <SpikeControls
          engine={engine}
          effectiveEngine={effectiveEngine}
          slow={slow}
          spring={spring}
          samples={readout.condition === readoutCondition ? readout : {}}
          onEngineChange={setEngine}
          onSlowChange={(next) => {
            dispatch({ type: "slow-changed", slow: next });
          }}
          onSpringChange={(next) => {
            dispatch({ type: "spring-changed", spring: next });
          }}
        />
        <OmbraDiagnostics
          slow={slow}
          spring={spring}
          onFrameSample={(kind, sample) => {
            benchListener.current?.(kind, sample);
            sendReadout({ type: "sampled", kind, condition: readoutConditionRef.current, sample });
          }}
        >
          <OmbraGallery items={items} morph={engine} />
        </OmbraDiagnostics>
      </div>
    </main>
  );
}

function reducedNote() {
  return (
    <p className="mt-4 max-w-xl text-sm leading-6 text-foreground/70">
      Add <span className="font-mono">?engine=vt</span>, <span className="font-mono">flip</span>, or{" "}
      <span className="font-mono">fade</span>, <span className="font-mono">?slow=1</span>, and{" "}
      <span className="font-mono">?spring=1</span> to inspect, and{" "}
      <span className="font-mono">?photos=3</span> (up to 50) to change how many photos there are.
      When the system asks for reduced motion, movement falls back to a fade.
    </p>
  );
}
