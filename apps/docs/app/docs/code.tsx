import { Fragment } from "react";
import type { CSSProperties, ReactNode } from "react";

import { highlight, highlightFragment } from "../../lib/highlight";
import type { CodeLanguage, CodeLine } from "../../lib/highlight";
import { CopyButton } from "./copy-button";

type TokenStyle = CSSProperties & { "--shiki-light": string; "--shiki-dark": string };

/** The surface every code panel shares: the prompt, the install tabs and the usage file. */
export const panelClassName =
  "overflow-hidden rounded-xl border border-foreground/10 bg-card shadow-xs dark:shadow-none";

export const panelHeaderClassName =
  "flex min-h-11 items-center justify-between gap-3 border-b border-foreground/10 bg-foreground/[0.025] px-3";

/** Coloured spans for one line. The colours come from `.code-tokens` in globals.css. */
function LineTokens({ line }: { line: CodeLine }) {
  return line.map((token, index) => {
    const style: TokenStyle = { "--shiki-light": token.light, "--shiki-dark": token.dark };

    return (
      <span key={index} style={style}>
        {token.content}
      </span>
    );
  });
}

/**
 * Lines joined by newlines, so the element's text is the source exactly: the prompt test
 * compares `textContent` with what the copy button writes.
 */
export function CodeLines({ lines }: { lines: readonly CodeLine[] }) {
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? "\n" : null}
      <LineTokens line={line} />
    </Fragment>
  ));
}

export async function HighlightedCode({ code, lang }: { code: string; lang: CodeLanguage }) {
  return <CodeLines lines={await highlight(code, lang)} />;
}

/** A TypeScript type or value set inline, coloured like the code blocks. */
export async function InlineCode({ code, position }: { code: string; position: "type" | "value" }) {
  return (
    <code className="code-tokens font-mono text-[13px] leading-5 break-words">
      <LineTokens line={await highlightFragment(code, position)} />
    </code>
  );
}

export function CodePre({ children, wrap }: { children: ReactNode; wrap?: boolean }) {
  return (
    <pre
      tabIndex={0}
      className={`code-tokens px-4 py-3.5 font-mono text-[13px] leading-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${wrap ? "break-words whitespace-pre-wrap" : "overflow-x-auto"}`}
    >
      <code>{children}</code>
    </pre>
  );
}

/** A file: name in the header, copy button, highlighted source. */
export async function CodeBlock({
  code,
  lang,
  title,
}: {
  code: string;
  lang: CodeLanguage;
  title: string;
}) {
  return (
    <figure className={panelClassName}>
      <figcaption className={panelHeaderClassName}>
        <span className="truncate pl-1 font-mono text-xs text-foreground/70">{title}</span>
        <CopyButton text={code} variant="code" />
      </figcaption>
      <CodePre>
        <HighlightedCode code={code} lang={lang} />
      </CodePre>
    </figure>
  );
}
