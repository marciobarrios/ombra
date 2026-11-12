"use client";

import { useRef, useState } from "react";

import type { FrameSample, MorphEngine, MorphKind } from "../../../../registry/ombra/types";

const ENGINES: readonly MorphEngine[] = ["flip", "vt", "fade"];

// Long enough for focus return, scroll restoration, and the next thumbnail to settle between runs.
const PAUSE_MS = 500;
const STEP_TIMEOUT_MS = 8_000;

type Row = Record<MorphKind, FrameSample[]>;

type Results = Partial<Record<MorphEngine, Row>>;

export type BenchSampleListener = (kind: MorphKind, sample: FrameSample) => void;

/**
 * Opens and closes the first photo `runs` times per engine with synthetic clicks, so the
 * smoothness check runs on a phone without counting by hand. It measures rendering, not touch.
 */
export function Bench({
  runs,
  setEngine,
  listen,
}: {
  runs: number;
  setEngine: (engine: MorphEngine) => void;
  /** Registers the listener the gallery's `onFrameSample` forwards to; null unregisters. */
  listen: (listener: BenchSampleListener | null) => void;
}) {
  const [results, setResults] = useState<Results>({});
  const [status, setStatus] = useState<string>("idle");
  const runningRef = useRef(false);

  async function run() {
    if (runningRef.current) return;

    runningRef.current = true;
    setResults({});

    const waiters: { kind: MorphKind; resolve: (sample: FrameSample) => void }[] = [];

    listen((kind, sample) => {
      const index = waiters.findIndex((waiter) => waiter.kind === kind);

      if (index === -1) return;

      const [waiter] = waiters.splice(index, 1);

      waiter.resolve(sample);
    });

    const nextSample = (kind: MorphKind) =>
      withTimeout(
        new Promise<FrameSample>((resolve) => {
          waiters.push({ kind, resolve });
        }),
        `${kind} sample`,
      );

    try {
      for (const engine of ENGINES) {
        setEngine(engine);
        await pause(PAUSE_MS);

        const row: Row = { open: [], close: [] };

        for (let index = 1; index <= runs; index += 1) {
          setStatus(`${engine} ${index}/${runs}`);

          const trigger = document.querySelector<HTMLElement>("[data-slot=ombra-trigger]");

          if (!trigger) throw new Error("No thumbnail to open.");

          trigger.scrollIntoView({ block: "center" });
          await pause(PAUSE_MS);

          const opened = nextSample("open");

          trigger.click();
          row.open.push(await opened);
          await pause(PAUSE_MS);

          const closeButton = document.querySelector<HTMLElement>("[data-slot=ombra-close]");

          if (!closeButton) throw new Error("No close button.");

          const closed = nextSample("close");

          closeButton.click();
          row.close.push(await closed);
          await until(() => !document.querySelector("[data-slot=ombra-viewer]"), "viewer to close");
          await pause(PAUSE_MS);
          setResults((current) => ({ ...current, [engine]: { ...row } }));
        }
      }

      setStatus("done");
    } catch (error) {
      setStatus(`stopped: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      listen(null);
      runningRef.current = false;
    }
  }

  return (
    <section
      data-slot="spike-bench"
      className="mt-8 max-w-full rounded-md bg-black/85 p-3 font-mono text-[11px] leading-4 text-white"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void run()}
          disabled={status !== "idle" && status !== "done" && !status.startsWith("stopped")}
          className="min-h-11 rounded-full bg-white px-4 text-sm text-black disabled:opacity-50"
        >
          Run {runs}× per engine
        </button>
        <span data-slot="spike-bench-status">{status}</span>
      </div>
      <p className="mt-2 text-white/70">
        clean: runs with no dropped frame. mid: runs with no drop between the first and last frame.
        Keep the screen on and do not touch it while it runs.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-max border-separate border-spacing-x-3">
          <thead className="text-left text-white/70">
            <tr>
              <th className="font-normal">engine</th>
              <th className="font-normal">open clean</th>
              <th className="font-normal">mid</th>
              <th className="font-normal">close clean</th>
              <th className="font-normal">mid</th>
              <th className="font-normal">longest</th>
              <th className="font-normal">interval</th>
            </tr>
          </thead>
          <tbody>
            {ENGINES.map((engine) => (
              <BenchRow key={engine} engine={engine} row={results[engine]} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BenchRow({ engine, row }: { engine: MorphEngine; row: Row | undefined }) {
  if (!row) {
    return (
      <tr data-slot="spike-bench-row" data-engine={engine}>
        <td>{engine}</td>
        <td colSpan={6} className="text-white/50">
          –
        </td>
      </tr>
    );
  }

  const all = [...row.open, ...row.close];
  const longest = Math.max(...all.map((sample) => sample.longestMs));
  const interval = median(all.map((sample) => sample.intervalMs));

  return (
    <tr data-slot="spike-bench-row" data-engine={engine}>
      <td>{engine}</td>
      <td>{count(row.open, (sample) => sample.dropped === 0)}</td>
      <td>{count(row.open, (sample) => sample.midDropped === 0)}</td>
      <td>{count(row.close, (sample) => sample.dropped === 0)}</td>
      <td>{count(row.close, (sample) => sample.midDropped === 0)}</td>
      <td>{longest.toFixed(1)} ms</td>
      <td>{interval.toFixed(1)} ms</td>
    </tr>
  );
}

function count(samples: readonly FrameSample[], pass: (sample: FrameSample) => boolean): string {
  return `${samples.filter(pass).length}/${samples.length}`;
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) return sorted[middle];

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer = 0;

  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(
      () => reject(new Error(`timed out waiting for ${what}`)),
      STEP_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

async function until(done: () => boolean, what: string): Promise<void> {
  const deadline = performance.now() + STEP_TIMEOUT_MS;

  while (!done()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);

    await pause(50);
  }
}
