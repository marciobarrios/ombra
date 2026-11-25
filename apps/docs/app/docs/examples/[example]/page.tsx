import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FullGallery } from "../../../../examples/full-gallery";
import { MinimalLightbox } from "../../../../examples/minimal-lightbox";
import { guideBySlug, listGuides } from "../../../../lib/guides";
import type { GuideDemo } from "../../../../lib/guides";
import { GuidePage } from "../../guide-page";

type ExamplePageProps = PageProps<"/docs/examples/[example]">;

const PREFIX = "examples/";

export function generateStaticParams() {
  return listGuides()
    .filter((guide) => guide.slug.startsWith(PREFIX))
    .map((guide) => ({ example: guide.slug.slice(PREFIX.length) }));
}

export async function generateMetadata({ params }: ExamplePageProps): Promise<Metadata> {
  const { example } = await params;
  const guide = guideBySlug(`${PREFIX}${example}`);

  if (!guide) return {};

  return { title: `${guide.title} — Ombra`, description: guide.description };
}

function Demo({ demo }: { demo: GuideDemo }) {
  switch (demo) {
    case "minimal":
      return <MinimalLightbox />;
    case "full-gallery":
      return <FullGallery />;
  }
}

export default async function ExamplePage({ params }: ExamplePageProps) {
  const { example } = await params;
  const guide = guideBySlug(`${PREFIX}${example}`);

  if (!guide) notFound();

  return <GuidePage guide={guide} demo={guide.demo ? <Demo demo={guide.demo} /> : undefined} />;
}
