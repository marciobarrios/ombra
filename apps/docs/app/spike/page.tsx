import { Suspense } from "react";

import { parseMorphEngine } from "../../../../registry/ombra/types";

import { SpikeApp } from "./spike-app";

export default function SpikePage({ searchParams }: PageProps<"/spike">) {
  return (
    <Suspense fallback={<div className="px-8 py-16 text-sm">Loading the spike…</div>}>
      <SpikeRoute searchParams={searchParams} />
    </Suspense>
  );
}

async function SpikeRoute({ searchParams }: { searchParams: PageProps<"/spike">["searchParams"] }) {
  const query = await searchParams;

  return (
    <SpikeApp
      initialEngine={parseMorphEngine(firstString(query.engine))}
      initialSlow={firstString(query.slow) === "1"}
      initialSpring={firstString(query.spring) === "1"}
      debugZoom={firstString(query.debug) === "zoom"}
      benchRuns={firstString(query.bench) === "1" ? benchRuns(firstString(query.runs)) : null}
    />
  );
}

function benchRuns(value: string | undefined): number {
  const runs = Number(value);

  return Number.isInteger(runs) && runs >= 1 && runs <= 50 ? runs : 10;
}

function firstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];

  return value;
}
