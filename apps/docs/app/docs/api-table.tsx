import type { SurfaceNote } from "../../lib/item-surface";
import { marksRequired } from "../../lib/surface-markdown";
import { InlineCode, panelClassName } from "./code";
import { Inline } from "./inline";

/** Name, type and default on one row, the note under them. Rows stack on a phone. */
export function ApiTable({
  nameLabel,
  entries,
}: {
  /** The first column's heading, such as Prop or Parameter. */
  nameLabel: string;
  entries: readonly SurfaceNote[];
}) {
  const markRequired = marksRequired(entries);
  const showDefault = entries.some((entry) => entry.default !== undefined);

  const columns = showDefault
    ? "sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,6.5rem)]"
    : "sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]";

  const cellLabel = "mr-2 text-xs text-foreground/70 sm:sr-only";

  return (
    <div className={panelClassName}>
      <div
        aria-hidden="true"
        className={`hidden gap-x-4 border-b border-foreground/10 bg-foreground/[0.025] px-4 py-2.5 text-[11px] font-medium tracking-[0.08em] text-foreground/70 uppercase sm:grid ${columns}`}
      >
        <span>{nameLabel}</span>
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
            <p className="text-sm leading-6 text-foreground/70 sm:col-span-full">
              <Inline text={entry.note} />
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
