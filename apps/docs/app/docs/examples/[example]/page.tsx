import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";

import { Album } from "../../../../examples/album";
import { ControlledLightbox } from "../../../../examples/controlled";
import { FullGallery } from "../../../../examples/full-gallery";
import { JsxChanges } from "../../../../examples/jsx-changes";
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
    case "album":
      return Album;
    case "jsx-changes":
      return JsxChanges;
    case "controlled":
      return ControlledLightbox;
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
