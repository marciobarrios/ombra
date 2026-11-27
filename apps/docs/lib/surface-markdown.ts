import type { ApiPart, ApiTable, SurfaceNote } from "./item-surface";

/** Marks required entries only in a list that also has optional ones, where the mark says something. */
export function marksRequired(entries: readonly SurfaceNote[]): boolean {
  return entries.some((entry) => !entry.required);
}

/** One bullet per entry: name, type, required, default, then the note. */
export function notesMarkdown(entries: readonly SurfaceNote[]): string {
  const markRequired = marksRequired(entries);

  return entries
    .map((entry) => {
      const facts = [
        `\`${entry.type}\``,
        markRequired && entry.required ? "required" : undefined,
        entry.default ? `default \`${entry.default}\`` : undefined,
      ];

      return `- \`${entry.name}\` (${facts.filter(Boolean).join(", ")}): ${entry.note}`;
    })
    .join("\n");
}

/** What a table's part also takes, said once under its own rows. */
export function baseSentence(table: ApiTable): string | undefined {
  if (table.kind !== "object" || !table.base) return undefined;

  return table.entries.length > 0
    ? `Also takes every prop of \`${table.base}\`.`
    : `Takes every prop of \`${table.base}\`, and adds none.`;
}

function tableMarkdown(table: ApiTable): string {
  const base = baseSentence(table);
  const rows = table.entries.length > 0 ? `\n\n${notesMarkdown(table.entries)}` : "";

  return `#### ${table.title}${base ? `\n\n${base}` : ""}${rows}`;
}

function hooksMarkdown(title: string, hooks: ApiPart["dataAttributes"]): string | undefined {
  if (!hooks || hooks.length === 0) return undefined;

  return `#### ${title}\n\n${hooks.map((hook) => `- \`${hook.name}\`: ${hook.note}`).join("\n")}`;
}

/** One part's API section, under the guide's group heading. */
export function partMarkdown(part: ApiPart): string {
  const facts = [
    `- Renders: ${part.renders}`,
    part.slot ? `- \`data-slot\`: \`${part.slot}\`` : undefined,
    `- Source: \`components/ombra/${part.file}\`, from the \`${part.item}\` registry item`,
    part.returns ? `- Returns: \`${part.returns}\`` : undefined,
  ];

  return [
    `### ${part.name}`,
    part.summary,
    facts.filter(Boolean).join("\n"),
    ...part.tables.map(tableMarkdown),
    hooksMarkdown("Data attributes", part.dataAttributes),
    hooksMarkdown("CSS variables", part.cssVariables),
  ]
    .filter(Boolean)
    .join("\n\n");
}
