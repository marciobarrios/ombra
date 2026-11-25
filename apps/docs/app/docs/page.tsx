import type { Metadata } from "next";
import Link from "next/link";

import { DOCS_INTRO, DOCS_ORIGIN, listItemDocs } from "../../lib/agent-docs";
import { guideMarkdownPath, guidePath, listGuides } from "../../lib/guides";

export const metadata: Metadata = {
  title: "Docs — Ombra",
  description: DOCS_INTRO,
};

const linkClassName =
  "underline decoration-foreground/30 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

type Entry = { key: string; title: string; description: string; path: string; markdown: string };

function EntryList({
  id,
  title,
  entries,
}: {
  id: string;
  title: string;
  entries: readonly Entry[];
}) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <h2 id={id} className="font-display text-sm tracking-[0.22em] text-foreground/70 uppercase">
        {title}
      </h2>
      <ul className="mt-6 flex flex-col gap-8">
        {entries.map((entry) => (
          <li key={entry.key}>
            <h3 className="font-display text-2xl">
              <Link href={entry.path} className={linkClassName}>
                {entry.title}
              </Link>
            </h3>
            <p className="mt-2 leading-7 text-foreground/80">{entry.description}</p>
            <p className="mt-2 text-sm">
              <a href={entry.markdown} className={linkClassName}>
                Markdown
              </a>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function DocsIndexPage() {
  const items = listItemDocs();
  const guides = listGuides();

  return (
    <main>
      <p className="font-display text-sm tracking-[0.22em] text-brand">DOCS</p>
      <h1 className="font-display mt-4 text-5xl leading-none">Ombra docs</h1>
      <p className="mt-6 text-lg leading-8 text-foreground/80">{DOCS_INTRO}</p>
      <EntryList
        id="composition"
        title="Composition"
        entries={guides.map((guide) => ({
          key: guide.slug,
          title: guide.title,
          description: guide.description,
          path: guidePath(guide),
          markdown: guideMarkdownPath(guide),
        }))}
      />
      <EntryList
        id="registry-items"
        title="Registry items"
        entries={items.map((item) => ({
          key: item.name,
          title: item.title,
          description: item.description,
          path: item.pagePath,
          markdown: item.markdownPath,
        }))}
      />
      <p className="mt-12 text-sm leading-6 text-foreground/70">
        <a href="/llms.txt" className={linkClassName}>
          llms.txt
        </a>{" "}
        lists these pages for agents. The spike at{" "}
        <Link href="/spike" className={linkClassName}>
          /spike
        </Link>{" "}
        is a development bench, not an install guide. Published links use {DOCS_ORIGIN}.
      </p>
    </main>
  );
}
