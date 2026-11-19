import { Suspense } from "react";

import { ControlsHarness } from "./controls-harness";

/**
 * Test bench for OmbraPrevious, OmbraNext, OmbraCounter, OmbraThumbnails and OmbraThumbnail,
 * with Spanish labels, a text field and a scrolling panel inside the viewer. `?controls=none`
 * leaves every control out.
 */
export default function ControlsHarnessPage({ searchParams }: PageProps<"/spike/controls">) {
  return (
    <Suspense fallback={<div className="px-8 py-16 text-sm">Loading the bench…</div>}>
      <ControlsRoute searchParams={searchParams} />
    </Suspense>
  );
}

async function ControlsRoute({
  searchParams,
}: {
  searchParams: PageProps<"/spike/controls">["searchParams"];
}) {
  const { controls } = await searchParams;
  const value = Array.isArray(controls) ? controls[0] : controls;

  return <ControlsHarness controls={value !== "none"} />;
}
