import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import type { ReactNode } from "react";

import {
  itemDocByName,
  listItemDocs,
  marksRequired,
  promptBlocks,
  promptFor,
} from "../../../lib/agent-docs";
import type { ItemDoc } from "../../../lib/agent-docs";
import type { SurfaceNote } from "../../../lib/item-surface";
import {
  CodeBlock,
  HighlightedCode,
  InlineCode,
  linkClassName,
  panelClassName,
  panelHeaderClassName,
} from "../code";
import { CopyButton } from "../copy-button";
import { GalleryDemo } from "../gallery-demo";
import { InstallTabs } from "../install-tabs";

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

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-14">
      <h2 id={id} className="font-display text-2xl">
        {title}
      </h2>
      {intro ? <p className="mt-2 text-sm leading-6 text-foreground/70">{intro}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * The prompt an agent follows. The `pre` holds the prompt text exactly, with the install
 * command and the usage example highlighted in place, so what it shows is what Copy writes.
 */
function PromptPanel({ doc }: { doc: ItemDoc }) {
  return (
    <section aria-labelledby="prompt" className={`mt-10 ${panelClassName}`}>
      <div className={`${panelHeaderClassName} flex-wrap py-2`}>
        <div className="flex min-w-0 items-center gap-2 pl-1">
          <Sparkles aria-hidden="true" className="size-4 shrink-0 text-brand" />
          <h2 id="prompt" className="text-sm font-medium">
            Prompt
          </h2>
          <span className="text-xs text-foreground/70">for your coding agent</span>
        </div>
        <div className="flex items-center gap-4">
          <a href={doc.markdownPath} className={`text-xs text-foreground/70 ${linkClassName}`}>
            Markdown
          </a>
          <CopyButton text={promptFor(doc)} variant="prompt" />
        </div>
      </div>
      <div className="relative">
        <pre
          data-agent-prompt=""
          tabIndex={0}
          aria-label="Prompt text"
          className="code-tokens max-h-[26rem] overflow-y-auto px-4 pt-4 pb-10 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-foreground/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand sm:text-[13px] sm:leading-6"
        >
          {promptBlocks(doc).map((block, index) => (
            <Fragment key={block.text}>
              {index > 0 ? "\n" : null}
              {block.lang ? <HighlightedCode code={block.text} lang={block.lang} /> : block.text}
            </Fragment>
          ))}
        </pre>
        {/* Says the prompt goes on below the fold. The bottom padding lets the last line clear it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-card to-transparent"
        />
      </div>
    </section>
  );
}

const nameColumn = { Props: "Prop", Parameters: "Parameter", "Item fields": "Field" } as const;

/** Name, type and default on one row, the note under them. Rows stack on a phone. */
function ApiList({
  title,
  entries,
}: {
  title: keyof typeof nameColumn;
  entries: readonly SurfaceNote[];
}) {
  if (entries.length === 0) return null;

  const markRequired = marksRequired(entries);
  const showDefault = entries.some((entry) => entry.default !== undefined);

  const columns = showDefault
    ? "sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,6.5rem)]"
    : "sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]";

  const cellLabel = "mr-2 text-xs text-foreground/70 sm:sr-only";

  return (
    <Section id={title.toLowerCase().replace(" ", "-")} title={title}>
      <div className={panelClassName}>
        <div
          aria-hidden="true"
          className={`hidden gap-x-4 border-b border-foreground/10 bg-foreground/[0.025] px-4 py-2.5 text-[11px] font-medium tracking-[0.08em] text-foreground/70 uppercase sm:grid ${columns}`}
        >
          <span>{nameColumn[title]}</span>
          <span>Type</span>
          {showDefault ? <span>Default</span> : null}
        </div>
        <ul className="divide-y divide-foreground/10">
          {entries.map((entry) => (
            <li
              key={entry.name}
              className={`grid gap-x-4 gap-y-1.5 px-4 py-3.5 sm:items-baseline ${columns}`}
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <code className="font-mono text-[13px] font-medium break-words">{entry.name}</code>
                {markRequired && entry.required ? (
                  <span className="rounded-full bg-brand/10 px-1.5 text-[11px] leading-5 font-medium text-brand">
                    required
                  </span>
                ) : null}
              </div>
              <div className="min-w-0">
                <span className={cellLabel}>Type</span>
                <InlineCode code={entry.type} position="type" />
              </div>
              {showDefault ? (
                // A phone stacks the cells, so an empty default there is only noise.
                <div className={`min-w-0 ${entry.default ? "" : "hidden sm:block"}`}>
                  <span className={cellLabel}>Default</span>
                  {entry.default ? (
                    <InlineCode code={entry.default} position="value" />
                  ) : (
                    <>
                      <span aria-hidden="true" className="font-mono text-[13px] text-foreground/40">
                        —
                      </span>
                      <span className="sr-only">None</span>
                    </>
                  )}
                </div>
              ) : null}
              <p className="text-sm leading-6 text-foreground/70 sm:col-span-full">{entry.note}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
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
      <PromptPanel doc={doc} />
      <Section
        id="installation"
        title="Installation"
        intro="The shadcn CLI copies the source into your project. There is no package to update."
      >
        <InstallTabs
          panelClassName={panelClassName}
          headerClassName={panelHeaderClassName}
          commands={doc.installCommands.map((entry) => ({
            manager: entry.manager,
            command: entry.command,
            code: <HighlightedCode code={entry.command} lang="bash" />,
          }))}
        />
      </Section>
      <Section
        id="usage"
        title="Usage"
        intro="The docs app typechecks this file against the registry source."
      >
        <CodeBlock code={doc.example} lang="tsx" title={doc.usageFile} />
      </Section>
      <ApiList title={doc.propsTitle} entries={doc.props} />
      <ApiList title="Item fields" entries={doc.fields} />
      {doc.name === "ombra" ? <GalleryDemo /> : null}
    </main>
  );
}
