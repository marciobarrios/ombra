"use client";

import { cn } from "cn";

import type { FrameSample, MorphEngine, MorphKind } from "../../../../registry/ombra/types";

import type { FrameTally } from "./frame-readout";

// Experiment controls for the spike page. They used to render inside `OmbraGallery`;
// the registry gallery now takes only the settings they produce (MAR-137).

const ENGINE_OPTIONS: { id: MorphEngine; label: string }[] = [
  { id: "vt", label: "View Transition" },
  { id: "flip", label: "FLIP" },
  { id: "fade", label: "Fade" },
];

function EngineSwitch({
  engine,
  onEngineChange,
}: {
  engine: MorphEngine;
  onEngineChange: (engine: MorphEngine) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Morph engine"
      data-slot="ombra-engine"
      className="flex flex-wrap rounded-full bg-foreground/5 p-1"
    >
      {ENGINE_OPTIONS.map((option) => {
        const selected = option.id === engine;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onEngineChange(option.id)}
            className={cn(
              "min-h-11 rounded-full px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2",
              selected
                ? "bg-foreground text-background"
                : "text-foreground focus-visible:outline-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SpringToggle({
  spring,
  onSpringChange,
}: {
  spring: boolean;
  onSpringChange: (spring: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={spring}
      data-slot="ombra-spring"
      onClick={() => onSpringChange(!spring)}
      className={cn(
        "min-h-11 rounded-full px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
        spring ? "bg-foreground text-background" : "text-foreground",
      )}
    >
      Spring
    </button>
  );
}

function formatLast(tally: FrameTally | undefined): string {
  if (!tally) return "–";

  const { last } = tally;

  return `${last.longestMs.toFixed(1)} ms / ${last.dropped} @ ${last.intervalMs.toFixed(1)} ms`;
}

/** Where the last run's drops fell, e.g. "drops at 1, 29 of 30", to tell start-up and settle cost from mid-flight jank. */
function formatDrops(sample: FrameSample): string {
  return `drops at ${sample.droppedAt.join(", ")} of ${sample.frames - 1}`;
}

function TallyLine({ kind, tally }: { kind: MorphKind; tally: FrameTally | undefined }) {
  // One line, always there: a first sample or a long list of drops would otherwise
  // push the grid down just as a close lands on its thumbnail.
  if (!tally) {
    return (
      <div aria-hidden="true" className="truncate pl-4 text-white/70">
        –
      </div>
    );
  }

  const { last, runs, clean, mid } = tally;

  return (
    <div data-slot={`ombra-readout-${kind}-tally`} className="truncate pl-4 text-white/70">
      clean {clean}/{runs} · mid {mid}/{runs}
      {last.dropped > 0 && (
        <>
          {" · "}
          <span data-slot={`ombra-readout-${kind}-drops`}>{formatDrops(last)}</span>
        </>
      )}
    </div>
  );
}

function FrameReadout({
  samples,
  engine,
}: {
  samples: Partial<Record<MorphKind, FrameTally>>;
  engine: MorphEngine;
}) {
  return (
    <div
      data-slot="ombra-readout"
      className="pointer-events-none w-max max-w-[min(100%,24rem)] rounded-md bg-black/80 px-3 py-2 font-mono text-[11px] leading-4 text-white"
    >
      <div>Longest frame / dropped @ frame interval</div>
      <div data-slot="ombra-readout-open">Open {formatLast(samples.open)}</div>
      <TallyLine kind="open" tally={samples.open} />
      <div data-slot="ombra-readout-close">Close {formatLast(samples.close)}</div>
      <TallyLine kind="close" tally={samples.close} />
      <div>Engine {engine}</div>
    </div>
  );
}

export function SpikeControls({
  engine,
  effectiveEngine,
  slow,
  spring,
  samples,
  onEngineChange,
  onSlowChange,
  onSpringChange,
}: {
  engine: MorphEngine;
  /** The engine that actually runs: reduced motion fades whatever is selected. */
  effectiveEngine: MorphEngine;
  slow: boolean;
  spring: boolean;
  samples: Partial<Record<MorphKind, FrameTally>>;
  onEngineChange: (engine: MorphEngine) => void;
  onSlowChange: (slow: boolean) => void;
  onSpringChange: (spring: boolean) => void;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 text-foreground sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col items-start gap-3">
        <EngineSwitch engine={engine} onEngineChange={onEngineChange} />
        <FrameReadout samples={samples} engine={effectiveEngine} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SpringToggle spring={spring} onSpringChange={onSpringChange} />
        <button
          type="button"
          aria-pressed={slow}
          data-slot="ombra-slow"
          onClick={() => onSlowChange(!slow)}
          className="min-h-11 rounded-full px-3 text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          {slow ? "Slow motion on" : "Slow motion"}
        </button>
      </div>
    </div>
  );
}
