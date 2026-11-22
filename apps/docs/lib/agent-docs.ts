import { readFileSync } from "node:fs";
import { join } from "node:path";

import registry from "../../../registry.json";

import { galleryItemFields, galleryProps, morphParams, zoomParams } from "./item-surface";
import type { SurfaceNote } from "./item-surface";

export const DOCS_ORIGIN = "https://www.useombra.dev";

const AFTER_INSTALL =
  "After installing, read the files under the installed `ombra` directory before writing code.";

export const DOCS_INTRO =
  "Ombra is a React lightbox you copy into your app with the shadcn CLI. There is no animation library. Each item page has a Copy prompt button. The prompt is built from the registry entry, the props, and the usage example the project typechecks.";

type RegistryItem = (typeof registry.items)[number];

type ItemName = RegistryItem["name"];

type PageMeta = {
  goal: string;
  exampleFile: string;
  props: readonly SurfaceNote[];
  fields: readonly SurfaceNote[];
};

const pageMeta = {
  ombra: {
    goal: "Add an Ombra lightbox to my React app.",
    exampleFile: "ombra.tsx",
    props: galleryProps,
    fields: galleryItemFields,
  },
  "ombra-morph": {
    goal: "Use Ombra's morph helpers in my React app.",
    exampleFile: "ombra-morph.tsx",
    props: morphParams,
    fields: [],
  },
  "ombra-zoom": {
    goal: "Add Ombra pinch and double-tap zoom to my React app.",
    exampleFile: "ombra-zoom.tsx",
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
  example: string;
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

function installCommand(name: string): string {
  return `npx shadcn add ${DOCS_ORIGIN}/r/${name}.json`;
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
    example: readExample(meta.exampleFile),
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

export function promptFor(doc: ItemDoc): string {
  const names = doc.props.map((prop) => prop.name).join(", ");

  return [
    doc.goal,
    "",
    "Install:",
    doc.install,
    "",
    AFTER_INSTALL,
    "",
    "Usage:",
    doc.example,
    "",
    `Props: ${names}.`,
    "",
    "Constraints:",
    doc.constraints,
    "",
    `Docs: ${doc.pageUrl}`,
  ].join("\n");
}

function notes(entries: readonly SurfaceNote[]): string {
  return entries.map((entry) => `- \`${entry.name}\`: ${entry.note}`).join("\n");
}

export function markdownFor(doc: ItemDoc): string {
  const fieldSection = doc.fields.length > 0 ? `\n## Item fields\n\n${notes(doc.fields)}\n` : "";

  return `# ${doc.title}

${doc.description}

## Prompt

\`\`\`text
${promptFor(doc)}
\`\`\`

## Props

${notes(doc.props)}
${fieldSection}`;
}

export function indexMarkdown(): string {
  const items = listItemDocs()
    .map((item) => `- [${item.title}](${item.pageUrl}): ${item.description}`)
    .join("\n");

  return `# Ombra docs

${DOCS_INTRO}

${items}

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
  ];

  return `${lines.join("\n")}\n`;
}
