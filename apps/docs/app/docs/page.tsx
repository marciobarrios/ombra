import type { Metadata } from "next";
import Link from "next/link";

import { DOCS_INTRO, DOCS_ORIGIN } from "../../lib/agent-docs";
import { docsNavigation } from "../../lib/navigation";
import type { NavEntry } from "../../lib/navigation";
import { linkClassName } from "./code";

export const metadata: Metadata = {
  title: "Docs — Ombra",
  description: DOCS_INTRO,
};

function EntryList({
  id,
  title,
  entries,
}: {
  id: string;
  title: string;
  entries: readonly NavEntry[];
}) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <h2 id={id} className="font-display text-sm tracking-[0.22em] text-foreground/70 uppercase">
        {title}
      </h2>
      <ul className="mt-6 flex flex-col gap-8">
        {entries.map((entry) => (
          <li key={entry.path}>
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
  return (
    <main>
      <p className="font-display text-sm tracking-[0.22em] text-brand">DOCS</p>
      <h1 className="font-display mt-4 text-5xl leading-none">Ombra docs</h1>
      <p className="mt-6 text-lg leading-8 text-foreground/80">{DOCS_INTRO}</p>
      {docsNavigation().map((group) => (
        <EntryList key={group.id} id={group.id} title={group.title} entries={group.entries} />
      ))}
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
