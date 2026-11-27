import type { Metadata } from "next";

import { MinimalLightbox } from "../../../examples/minimal-lightbox";
import { quickStart } from "../../../lib/getting-started";
import { GuidePage } from "../guide-page";

export const metadata: Metadata = {
  title: `${quickStart.title} — Ombra`,
  description: quickStart.description,
};

export default function QuickStartPage() {
  return <GuidePage guide={quickStart} demo={<MinimalLightbox />} />;
}
