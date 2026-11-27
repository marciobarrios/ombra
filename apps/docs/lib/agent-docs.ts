import { exampleSource } from "./guides";
import { installCommand, registryItems } from "./install";
import type { ItemName, RegistryItem } from "./install";
import {
  bentoProps,
  galleryItemFields,
  galleryProps,
  mosaicProps,
  morphParams,
  zoomParams,
} from "./item-surface";
import type { SurfaceNote } from "./item-surface";
import { docsNavigation } from "./navigation";
import { DOCS_ORIGIN } from "./origin";
import { notesMarkdown } from "./surface-markdown";

export { DOCS_ORIGIN };

const AFTER_INSTALL =
  "After installing, read the files under the installed `ombra` directory before writing code.";

export const DOCS_INTRO =
  "Ombra is a React lightbox you copy into your app with the shadcn CLI. There is no animation library. Each item page has a Copy prompt button. The prompt is built from the registry entry, the props, and the usage example the project typechecks.";

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
  "ombra-bento": {
    goal: "Show my Ombra gallery as a bento with a +N overflow tile.",
    exampleFile: "ombra-bento.tsx",
    usageFile: "trip-photos.tsx",
    propsTitle: "Props",
    props: bentoProps,
    fields: [],
  },
  "ombra-mosaic": {
    goal: "Show my Ombra gallery as a justified mosaic.",
    exampleFile: "ombra-mosaic.tsx",
    usageFile: "photo-wall.tsx",
    propsTitle: "Props",
    props: mosaicProps,
    fields: [],
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
    case "ombra-bento":
      return pageMeta["ombra-bento"];
    case "ombra-mosaic":
      return pageMeta["ombra-mosaic"];
    case "ombra-morph":
      return pageMeta["ombra-morph"];
    case "ombra-zoom":
      return pageMeta["ombra-zoom"];
    default:
      throw new Error(`No docs page for registry item ${name}`);
  }
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
    example: exampleSource(meta.exampleFile),
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

  cached = registryItems().map((item) => itemDoc(item));

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

export function markdownFor(doc: ItemDoc): string {
  const fieldSection =
    doc.fields.length > 0 ? `\n## Item fields\n\n${notesMarkdown(doc.fields)}\n` : "";

  return `# ${doc.title}

${doc.description}

## Prompt

\`\`\`text
${promptFor(doc)}
\`\`\`

## ${doc.propsTitle}

${notesMarkdown(doc.props)}
${fieldSection}`;
}

export function indexMarkdown(): string {
  const groups = docsNavigation().map((group) => {
    const entries = group.entries
      .map((entry) => `- [${entry.title}](${DOCS_ORIGIN}${entry.path}): ${entry.description}`)
      .join("\n");

    return `## ${group.title}\n\n${entries}`;
  });

  return `# Ombra docs

${DOCS_INTRO}

${groups.join("\n\n")}

Machine-readable index: ${DOCS_ORIGIN}/llms.txt
`;
}

export function llmsTxt(): string {
  const first = listItemDocs()[0];

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
    ...docsNavigation().flatMap((group) => [
      "",
      `## ${group.title}`,
      "",
      ...group.entries.map(
        (entry) => `- [${entry.title}](${DOCS_ORIGIN}${entry.markdown}): ${entry.description}`,
      ),
    ]),
  ];

  return `${lines.join("\n")}\n`;
}
