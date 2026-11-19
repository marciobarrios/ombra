import { Suspense } from "react";

import { ZoomHarness } from "./zoom-harness";
import type { ZoomMode } from "./zoom-harness";

/**
 * Test bench for OmbraZoom, OmbraZoomIn and OmbraZoomOut. `?zoom=off` renders no OmbraZoom,
 * `?zoom=first` wraps only the first slide, and anything else wraps every slide.
 */
export default function ZoomHarnessPage({ searchParams }: PageProps<"/spike/zoom">) {
  return (
    <Suspense fallback={<div className="px-8 py-16 text-sm">Loading the bench…</div>}>
      <ZoomRoute searchParams={searchParams} />
    </Suspense>
  );
}

async function ZoomRoute({
  searchParams,
}: {
  searchParams: PageProps<"/spike/zoom">["searchParams"];
}) {
  const { zoom } = await searchParams;
  const value = Array.isArray(zoom) ? zoom[0] : zoom;
  const mode: ZoomMode = value === "off" || value === "first" ? value : "all";

  return <ZoomHarness mode={mode} />;
}
