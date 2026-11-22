import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { itemDocByName, listItemDocs, promptFor } from "../../../lib/agent-docs";
import type { SurfaceNote } from "../../../lib/item-surface";
import { CopyPrompt } from "../copy-prompt";
import { GalleryDemo } from "../gallery-demo";

type ItemPageProps = PageProps<"/docs/[item]">;

export function generateStaticParams() {
  return listItemDocs().map((doc) => ({ item: doc.name }));
}

export async function generateMetadata({ params }: ItemPageProps): Promise<Metadata> {
  const { item } = await params;
  const doc = itemDocByName(item);

  if (!doc) return {};

  return { title: `${doc.title} — Ombra`, description: doc.description };
}

function Notes({ title, notes }: { title: string; notes: readonly SurfaceNote[] }) {
  if (notes.length === 0) return null;

  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl">{title}</h2>
      <dl className="mt-4 flex flex-col gap-4">
        {notes.map((note) => (
          <div key={note.name}>
            <dt className="font-mono text-sm">{note.name}</dt>
            <dd className="mt-1 leading-6 text-foreground/80">{note.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function ItemDocsPage({ params }: ItemPageProps) {
  const { item } = await params;
  const doc = itemDocByName(item);

  if (!doc) notFound();

  return (
    <main>
      <p className="font-display text-sm tracking-[0.22em] text-brand">DOCS</p>
      <h1 className="font-display mt-4 text-5xl leading-none">{doc.title}</h1>
      <p className="mt-6 text-lg leading-8 text-foreground/80">{doc.description}</p>
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl">Prompt</h2>
          <a
            href={doc.markdownPath}
            className="text-sm underline decoration-foreground/30 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Markdown
          </a>
        </div>
        <div className="mt-4">
          <CopyPrompt prompt={promptFor(doc)} />
        </div>
      </section>
      <Notes title="Props" notes={doc.props} />
      <Notes title="Item fields" notes={doc.fields} />
      {doc.name === "ombra" ? <GalleryDemo /> : null}
    </main>
  );
}
