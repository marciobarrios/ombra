import { installation, introduction, quickStart } from "./getting-started";
import {
  anatomy,
  apiReference,
  exampleGuide,
  guideMarkdownPath,
  guidePath,
  recipes,
} from "./guides";
import type { Guide } from "./guides";
import { registryItems } from "./install";

/**
 * The docs pages in reading order, grouped as the sidebar, the docs index, `docs.md` and
 * `llms.txt` list them. A page that is in none of these groups is not linked from the docs.
 */
export type NavEntry = {
  /** The page path, such as `/docs/quick-start`. */
  path: string;
  markdown: string;
  title: string;
  description: string;
};

export type NavGroup = { id: string; title: string; entries: readonly NavEntry[] };

function guideEntry(guide: Guide | undefined): NavEntry {
  if (!guide) throw new Error("A docs group lists a guide that does not exist.");

  return {
    path: guidePath(guide),
    markdown: guideMarkdownPath(guide),
    title: guide.title,
    description: guide.description,
  };
}

const groups: readonly NavGroup[] = [
  {
    id: "getting-started",
    title: "Getting started",
    entries: [introduction, installation, quickStart].map(guideEntry),
  },
  {
    id: "composition",
    title: "Composition",
    entries: [
      anatomy,
      exampleGuide("minimal"),
      exampleGuide("full-gallery"),
      exampleGuide("album"),
      exampleGuide("jsx-changes"),
      exampleGuide("controlled"),
      recipes,
    ].map(guideEntry),
  },
  {
    id: "api-reference",
    title: "API reference",
    entries: [
      guideEntry(apiReference),
      ...registryItems().map((item) => ({
        path: `/docs/${item.name}`,
        markdown: `/docs/${item.name}.md`,
        title: item.title,
        description: item.description,
      })),
    ],
  },
];

export function docsNavigation(): readonly NavGroup[] {
  return groups;
}
