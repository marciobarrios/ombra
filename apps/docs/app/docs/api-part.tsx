import type { ApiHook, ApiPart, ApiTable as ApiTableData } from "../../lib/item-surface";
import { baseSentence } from "../../lib/surface-markdown";
import { ApiTable } from "./api-table";
import { InlineCode } from "./code";
import { Inline } from "./inline";

const nameLabel = {
  Props: "Prop",
  Parameters: "Parameter",
  Returns: "Field",
  "Item fields": "Field",
  "Photo fields": "Field",
} as const satisfies Record<ApiTableData["title"], string>;

/** `OmbraZoomIn` → `ombra-zoom-in`, the part's anchor. */
function anchorFor(name: string): string {
  return name.replaceAll(/(?<!^)([A-Z])/g, "-$1").toLowerCase();
}

function Heading({ id, title }: { id: string; title: string }) {
  return (
    <h4 id={id} className="text-sm font-medium">
      {title}
    </h4>
  );
}

function TableSection({ partId, table }: { partId: string; table: ApiTableData }) {
  const id = `${partId}-${anchorFor(table.title.replace(" ", ""))}`;
  const base = baseSentence(table);

  return (
    <div className="flex flex-col gap-3">
      <Heading id={id} title={table.title} />
      {base ? (
        <p className="text-sm leading-6 text-foreground/70">
          <Inline text={base} />
        </p>
      ) : null}
      {table.entries.length > 0 ? (
        <ApiTable nameLabel={nameLabel[table.title]} entries={table.entries} />
      ) : null}
    </div>
  );
}

function HookList({ id, title, hooks }: { id: string; title: string; hooks?: readonly ApiHook[] }) {
  if (!hooks || hooks.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <Heading id={id} title={title} />
      <ul className="flex flex-col gap-2 text-sm leading-6 text-foreground/70">
        {hooks.map((hook) => (
          <li key={hook.name}>
            <code className="font-mono text-[13px] font-medium text-foreground">{hook.name}</code>
            {": "}
            <Inline text={hook.note} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One public part: what it renders, its tables, then the attributes and variables it sets. */
export function ApiPartView({ part }: { part: ApiPart }) {
  const id = anchorFor(part.name);

  return (
    <article
      aria-labelledby={id}
      className="mt-4 flex scroll-mt-6 flex-col gap-5 border-t border-foreground/10 pt-8"
    >
      <h3 id={id} className="scroll-mt-10 font-mono text-lg font-medium break-words">
        {part.name}
      </h3>
      <p className="leading-7 text-foreground/80">
        <Inline text={part.summary} />
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm leading-6">
        <dt className="text-foreground/70">Renders</dt>
        <dd className="min-w-0">
          <Inline text={part.renders} />
        </dd>
        {part.slot ? (
          <>
            <dt className="text-foreground/70">
              <code className="font-mono text-[13px]">data-slot</code>
            </dt>
            <dd className="min-w-0">
              <InlineCode code={`"${part.slot}"`} position="value" />
            </dd>
          </>
        ) : null}
        <dt className="text-foreground/70">Source</dt>
        <dd className="min-w-0 break-words">
          <Inline text={`\`components/ombra/${part.file}\` from \`${part.item}\``} />
        </dd>
        {part.returns ? (
          <>
            <dt className="text-foreground/70">Returns</dt>
            <dd className="min-w-0">
              <InlineCode code={part.returns} position="type" />
            </dd>
          </>
        ) : null}
      </dl>
      {part.tables.map((table) => (
        <TableSection key={table.title} partId={id} table={table} />
      ))}
      <HookList id={`${id}-data-attributes`} title="Data attributes" hooks={part.dataAttributes} />
      <HookList id={`${id}-css-variables`} title="CSS variables" hooks={part.cssVariables} />
    </article>
  );
}
