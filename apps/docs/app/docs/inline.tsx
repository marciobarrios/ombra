import Link from "next/link";

import { linkClassName } from "./code";

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

/** Backticks, bold and links in a run of guide text. Nothing else is Markdown here. */
export function Inline({ text }: { text: string }) {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded bg-foreground/[0.06] px-1 py-0.5 font-mono text-[0.85em] break-words"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-medium text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);

    if (link) {
      return (
        <Link key={index} href={link[2] ?? "/docs"} className={linkClassName}>
          {link[1]}
        </Link>
      );
    }

    return part;
  });
}
