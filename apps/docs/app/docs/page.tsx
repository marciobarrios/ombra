import type { Metadata } from "next";
import Link from "next/link";

import { DOCS_INTRO, DOCS_ORIGIN, listItemDocs } from "../../lib/agent-docs";

export const metadata: Metadata = {
  title: "Docs — Ombra",
  description: DOCS_INTRO,
};

export default function DocsIndexPage() {
  const items = listItemDocs();

  return (
    <main>
      <p className="font-display text-sm tracking-[0.22em] text-brand">DOCS</p>
      <h1 className="font-display mt-4 text-5xl leading-none">Ombra docs</h1>
      <p className="mt-6 text-lg leading-8 text-foreground/80">{DOCS_INTRO}</p>
      <ul className="mt-10 flex flex-col gap-8">
        {items.map((item) => (
          <li key={item.name}>
            <h2 className="font-display text-2xl">
              <Link
                href={item.pagePath}
                className="underline decoration-foreground/30 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {item.title}
              </Link>
            </h2>
            <p className="mt-2 leading-7 text-foreground/80">{item.description}</p>
            <p className="mt-2 text-sm">
              <a
                href={item.markdownPath}
                className="underline decoration-foreground/30 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Markdown
              </a>
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-12 text-sm leading-6 text-foreground/70">
        <a
          href="/llms.txt"
          className="underline decoration-foreground/30 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          llms.txt
        </a>{" "}
        lists these pages for agents. The spike at{" "}
        <Link
          href="/spike"
          className="underline decoration-foreground/30 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          /spike
        </Link>{" "}
        is a development bench, not an install guide. Published links use {DOCS_ORIGIN}.
      </p>
    </main>
  );
}
