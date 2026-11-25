import type { Metadata } from "next";

import { guideBySlug } from "../../../lib/guides";
import type { Guide } from "../../../lib/guides";
import { GuidePage } from "../guide-page";

function anatomy(): Guide {
  const guide = guideBySlug("anatomy");

  if (!guide) throw new Error("The anatomy guide is missing.");

  return guide;
}

export function generateMetadata(): Metadata {
  const guide = anatomy();

  return { title: `${guide.title} — Ombra`, description: guide.description };
}

export default function AnatomyPage() {
  return <GuidePage guide={anatomy()} />;
}
