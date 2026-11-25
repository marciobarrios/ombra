import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";

import { FullGallery } from "../../../../examples/full-gallery";
import { MinimalLightbox } from "../../../../examples/minimal-lightbox";
import { exampleGuide, exampleNames } from "../../../../lib/guides";
import { GuidePage } from "../../guide-page";

type ExamplePageProps = PageProps<"/docs/examples/[example]">;

/** The live demo for each example, rendered from the file the page lists. */
function demoFor(example: string): ComponentType | undefined {
  switch (example) {
    case "minimal":
      return MinimalLightbox;
    case "full-gallery":
      return FullGallery;
    default:
      return undefined;
  }
}

export function generateStaticParams() {
  return exampleNames().map((example) => ({ example }));
}

export async function generateMetadata({ params }: ExamplePageProps): Promise<Metadata> {
  const guide = exampleGuide((await params).example);

  if (!guide) return {};

  return { title: `${guide.title} — Ombra`, description: guide.description };
}

export default async function ExamplePage({ params }: ExamplePageProps) {
  const { example } = await params;
  const guide = exampleGuide(example);
  const Demo = demoFor(example);

  if (!guide || !Demo) notFound();

  return <GuidePage guide={guide} demo={<Demo />} />;
}
