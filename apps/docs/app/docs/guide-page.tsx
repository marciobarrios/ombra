import type { ReactNode } from "react";

import { exampleSource, guideMarkdownPath } from "../../lib/guides";
import type { Guide, GuideBlock } from "../../lib/guides";
import { ApiPartView } from "./api-part";
import { CodeBlock, CodePre, linkClassName, panelClassName } from "./code";
import { Inline } from "./inline";

function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "text":
      return (
        <p className="leading-7 text-foreground/80">
          <Inline text={block.text} />
        </p>
      );
    case "list":
      return (
        <ul className="flex list-disc flex-col gap-2 pl-5 leading-7 text-foreground/80 marker:text-foreground/40">
          {block.items.map((item) => (
            <li key={item}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );
    case "tree":
      return (
        <div className={panelClassName}>
          <CodePre>{block.text}</CodePre>
        </div>
      );
    case "file":
      return (
        <CodeBlock
          code={exampleSource(block.file)}
          // TSX highlighting covers plain TypeScript too.
          lang="tsx"
          title={block.file}
        />
      );
    case "api":
      return <ApiPartView part={block.part} />;
  }
}

/** A guide: title, description, an optional live demo, then its sections. */
export function GuidePage({ guide, demo }: { guide: Guide; demo?: ReactNode }) {
  return (
    <main>
      <p className="font-display text-sm tracking-[0.22em] text-brand">DOCS</p>
      <h1 className="font-display mt-4 text-5xl leading-none">{guide.title}</h1>
      <p className="mt-6 text-lg leading-8 text-foreground/80">{guide.description}</p>
      <p className="mt-4 text-sm">
        <a href={guideMarkdownPath(guide)} className={`text-foreground/70 ${linkClassName}`}>
          Markdown
        </a>
      </p>
      {demo ? (
        <section aria-labelledby="demo" className="mt-10">
          <h2 id="demo" className="sr-only">
            Demo
          </h2>
          <div className={`${panelClassName} p-4 sm:p-6`}>{demo}</div>
        </section>
      ) : null}
      {guide.sections.map((section) => (
        <section key={section.id} aria-labelledby={section.id} className="mt-14">
          <h2 id={section.id} className="font-display text-2xl">
            {section.title}
          </h2>
          <div className="mt-5 flex flex-col gap-5">
            {section.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
