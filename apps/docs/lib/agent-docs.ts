import { readFileSync } from "node:fs";
import { join } from "node:path";

import registry from "../../../registry.json";

import { guideMarkdownPath, guidePath, listGuides } from "./guides";
import { galleryItemFields, galleryProps, morphParams, zoomParams } from "./item-surface";
import type { SurfaceNote } from "./item-surface";
import { DOCS_ORIGIN } from "./origin";

export { DOCS_ORIGIN };

const AFTER_INSTALL =
  "After installing, read the files under the installed `ombra` directory before writing code.";

export const DOCS_INTRO =
  "Ombra is a React lightbox you copy into your app with the shadcn CLI. There is no animation library. Each item page has a Copy prompt button. The prompt is built from the registry entry, the props, and the usage example the project typechecks.";

type RegistryItem = (typeof registry.items)[number];

type ItemName = RegistryItem["name"];

type PageMeta = {
  goal: string;
  exampleFile: string;
  /** The file name shown above the usage example, as a reader would save it. */
  usageFile: string;
  /** What the first table lists: a component's props, or a function's parameters in order. */
  propsTitle: "Props" | "Parameters";
  props: readonly SurfaceNote[];
  fields: readonly SurfaceNote[];
};

const pageMeta = {
  ombra: {
    goal: "Add an Ombra lightbox to my React app.",
    exampleFile: "ombra.tsx",
    usageFile: "gallery.tsx",
    propsTitle: "Props",
    props: galleryProps,
    fields: galleryItemFields,
  },
  "ombra-morph": {
    goal: "Use Ombra's morph helpers in my React app.",
    exampleFile: "ombra-morph.tsx",
    usageFile: "engine.ts",
    propsTitle: "Parameters",
    props: morphParams,
    fields: [],
  },
  "ombra-zoom": {
    goal: "Add Ombra pinch and double-tap zoom to my React app.",
    exampleFile: "ombra-zoom.tsx",
    usageFile: "zoomed-photo.tsx",
    propsTitle: "Parameters",
    props: zoomParams,
    fields: [],
  },
} satisfies Record<ItemName, PageMeta>;

export type ItemDoc = {
  name: ItemName;
  title: string;
  description: string;
  goal: string;
  constraints: string;
  install: string;
  installCommands: readonly InstallCommand[];
  example: string;
  usageFile: string;
  propsTitle: PageMeta["propsTitle"];
  props: readonly SurfaceNote[];
  fields: readonly SurfaceNote[];
  pagePath: string;
  markdownPath: string;
  pageUrl: string;
  markdownUrl: string;
};

function metaFor(name: string): PageMeta {
  switch (name) {
    case "ombra":
      return pageMeta.ombra;
    case "ombra-morph":
      return pageMeta["ombra-morph"];
    case "ombra-zoom":
      return pageMeta["ombra-zoom"];
    default:
      throw new Error(`No docs page for registry item ${name}`);
  }
}

export type InstallCommand = { manager: "pnpm" | "npm" | "yarn" | "bun"; command: string };

function installCommand(name: string): string {
  return `npx shadcn add ${DOCS_ORIGIN}/r/${name}.json`;
}

function installCommands(name: string): readonly InstallCommand[] {
  const url = `${DOCS_ORIGIN}/r/${name}.json`;

  return [
    { manager: "pnpm", command: `pnpm dlx shadcn add ${url}` },
    { manager: "npm", command: installCommand(name) },
    { manager: "yarn", command: `yarn dlx shadcn add ${url}` },
    { manager: "bun", command: `bunx --bun shadcn add ${url}` },
  ];
}

function readExample(file: string): string {
  return readFileSync(join(process.cwd(), "examples", file), "utf8").trim();
}

function itemDoc(item: RegistryItem): ItemDoc {
  const meta = metaFor(item.name);
  const pagePath = `/docs/${item.name}`;
  const markdownPath = `/docs/${item.name}.md`;

  return {
    name: item.name,
    title: item.title,
    description: item.description,
    goal: meta.goal,
    constraints: item.docs,
    install: installCommand(item.name),
    installCommands: installCommands(item.name),
    example: readExample(meta.exampleFile),
    usageFile: meta.usageFile,
    propsTitle: meta.propsTitle,
    props: meta.props,
    fields: meta.fields,
    pagePath,
    markdownPath,
    pageUrl: `${DOCS_ORIGIN}${pagePath}`,
    markdownUrl: `${DOCS_ORIGIN}${markdownPath}`,
  };
}

let cached: readonly ItemDoc[] | undefined;

export function listItemDocs(): readonly ItemDoc[] {
  if (cached) return cached;

  cached = registry.items.map((item) => itemDoc(item));

  return cached;
}

export function itemDocByName(name: string): ItemDoc | undefined {
  return listItemDocs().find((item) => item.name === name);
}

/** A run of prompt text. Code runs carry their language so the page can highlight them. */
export type PromptBlock = { text: string; lang?: "bash" | "tsx" };

/** The prompt in order. `promptFor` joins the blocks with newlines. */
export function promptBlocks(doc: ItemDoc): readonly PromptBlock[] {
  const names = doc.props.map((prop) => prop.name).join(", ");

  return [
    { text: `${doc.goal}\n\nInstall:` },
    { text: doc.install, lang: "bash" },
    { text: `\n${AFTER_INSTALL}\n\nUsage:` },
    { text: doc.example, lang: "tsx" },
    {
      text: `\nProps: ${names}.\n\nConstraints:\n${doc.constraints}\n\nDocs: ${doc.pageUrl}`,
    },
  ];
}

export function promptFor(doc: ItemDoc): string {
  return promptBlocks(doc)
    .map((block) => block.text)
    .join("\n");
}

/** Marks required entries only in a list that also has optional ones, where the mark says something. */
export function marksRequired(entries: readonly SurfaceNote[]): boolean {
  return entries.some((entry) => !entry.required);
}

function notes(entries: readonly SurfaceNote[]): string {
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

export function markdownFor(doc: ItemDoc): string {
  const fieldSection = doc.fields.length > 0 ? `\n## Item fields\n\n${notes(doc.fields)}\n` : "";

  return `# ${doc.title}

${doc.description}

## Prompt

\`\`\`text
${promptFor(doc)}
\`\`\`

## ${doc.propsTitle}

${notes(doc.props)}
${fieldSection}`;
}

export function indexMarkdown(): string {
  const items = listItemDocs()
    .map((item) => `- [${item.title}](${item.pageUrl}): ${item.description}`)
    .join("\n");

  const guides = listGuides()
    .map((guide) => `- [${guide.title}](${DOCS_ORIGIN}${guidePath(guide)}): ${guide.description}`)
    .join("\n");

  return `# Ombra docs

${DOCS_INTRO}

## Registry items

${items}

## Composition

${guides}

Machine-readable index: ${DOCS_ORIGIN}/llms.txt
`;
}

export function llmsTxt(): string {
  const items = listItemDocs();
  const first = items[0];

  const lines = [
    "# Ombra",
    "",
    "> Ombra is a React lightbox you copy into your app with the shadcn CLI. There is no animation library.",
    "",
    AFTER_INSTALL,
    "",
    first ? first.constraints : "",
    "",
    "## Docs",
    "",
    `- [Ombra docs](${DOCS_ORIGIN}/docs.md): Install path, registry items, and the constraints an agent cannot guess from the source.`,
    ...items.map((item) => `- [${item.title}](${item.markdownUrl}): ${item.description}`),
    "",
    "## Composition",
    "",
    ...listGuides().map(
      (guide) =>
        `- [${guide.title}](${DOCS_ORIGIN}${guideMarkdownPath(guide)}): ${guide.description}`,
    ),
  ];

  return `${lines.join("\n")}\n`;
}
