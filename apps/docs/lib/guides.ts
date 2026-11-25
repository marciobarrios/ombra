import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DOCS_ORIGIN } from "./origin";

/**
 * Docs pages that are not one registry item: the anatomy and the composition examples.
 * Each page is written once here, so the HTML page and its Markdown version say the same.
 * Text runs may hold `code` in backticks; the page renders those as inline code.
 */
export type GuideBlock =
  | { kind: "text"; text: string }
  | { kind: "list"; items: readonly string[] }
  | { kind: "tree"; text: string }
  /** A file under `apps/docs/examples`, shown with its name. */
  | { kind: "file"; file: string };

export type GuideSection = { id: string; title: string; blocks: readonly GuideBlock[] };

export type Guide = {
  /** The path under `/docs`, without the leading slash. */
  slug: string;
  title: string;
  description: string;
  sections: readonly GuideSection[];
};

export const anatomy: Guide = {
  slug: "anatomy",
  title: "Anatomy",
  description:
    "How Ombra's parts nest, and how stable item IDs connect the triggers, slides and thumbnails.",
  sections: [
    {
      id: "layers",
      title: "Three layers",
      blocks: [
        {
          kind: "list",
          items: [
            "**Parts** are React components, one job each: `OmbraRoot`, `OmbraTrigger`, the dialog shell, the slides, zoom and the controls. A lightbox is the JSX you write with them.",
            "**Recipes** are lightboxes already written from the parts: `OmbraGallery` and `OmbraAlbum`. They are files in your project, so you edit them like any other component.",
            "**Helpers** are the pieces under the parts that you can use on their own: `resolveMorphEngine` from `ombra-morph` and `useZoom` from `ombra-zoom`.",
          ],
        },
        {
          kind: "text",
          text: "Layout, media, captions and controls belong in JSX. Props only configure the part that receives them, so moving, replacing or leaving out a control never needs a new prop.",
        },
      ],
    },
    {
      id: "nesting",
      title: "How the parts nest",
      blocks: [
        {
          kind: "tree",
          text: `OmbraRoot                  state: open, active item, morph
├── OmbraTrigger           one per photo on the page
└── OmbraPortal            runs the viewer
    ├── OmbraBackdrop
    └── OmbraContent       the dialog
        ├── OmbraClose
        ├── OmbraSlides    the scroll-snap track
        │   └── OmbraSlide
        │       └── OmbraZoom      optional
        │           └── OmbraMedia
        │               └── <img>, <picture> or Next.js Image
        └── controls       optional: OmbraPrevious, OmbraNext,
                           OmbraCounter, OmbraThumbnails, OmbraCaption`,
        },
        {
          kind: "list",
          items: [
            "`OmbraRoot` owns the state. It renders the dialog root that every trigger and shell part shares, so a composition needs no dialog root of its own. Render one `OmbraPortal` per root.",
            "`OmbraPortal` runs the viewer: the open and close morphs, pull to dismiss, zoom and the keyboard shortcuts. `OmbraBackdrop` and `OmbraContent` take its refs and state attributes.",
            "`OmbraSlides` is a native scroll-snap track. Each `OmbraSlide` is one snap box; `OmbraMedia` fits the photo inside it and is the box the morph lands on.",
            "`OmbraZoom` wraps the media of a slide that can zoom. Leave it out and that slide does not zoom.",
            'Wrap the content\'s children in an element with `data-slot="ombra-sheet"` to have the registry CSS scale and round it while the viewer is pulled to dismiss.',
          ],
        },
      ],
    },
    {
      id: "item-ids",
      title: "Item IDs",
      blocks: [
        {
          kind: "text",
          text: "Items are identified by stable string IDs, never by index. `OmbraRoot` takes the collection in navigation order as `itemIds`; each `OmbraTrigger`, `OmbraSlide` and `OmbraThumbnail` names its item with `itemId`.",
        },
        {
          kind: "list",
          items: [
            "The slides mount only with the viewer, so a closed viewer learns what it can open on from `itemIds`.",
            "A trigger opens its item, and the viewer closes back onto the trigger of the item it shows, even after navigating. With no trigger on the page for that item, the viewer fades out instead of morphing to another photo.",
            "Reordering the collection keeps the open photo open, because the ID follows it.",
            "`useOmbraState()` returns `open`, `phase`, `activeId`, `index` and `itemIds`, for titles, captions and announcements you render around the parts.",
          ],
        },
      ],
    },
    {
      id: "labels",
      title: "Labels",
      blocks: [
        {
          kind: "text",
          text: "Ombra ships no visible text. Name the dialog with `aria-label` on `OmbraContent` or a `Dialog.Title` inside it, and give every icon-only control an `aria-label` in your own language.",
        },
      ],
    },
    {
      id: "next",
      title: "Examples",
      blocks: [
        {
          kind: "list",
          items: [
            "[Minimal lightbox](/docs/examples/minimal): the root, triggers, shell, slides, media and close.",
            "[Full gallery](/docs/examples/full-gallery): `OmbraGallery` written out from the parts, with zoom and every control.",
          ],
        },
      ],
    },
  ],
};

const photosFile: GuideBlock = { kind: "file", file: "photos.ts" };

const minimal: Guide = {
  slug: "examples/minimal",
  title: "Minimal lightbox",
  description:
    "The smallest lightbox built from the parts: triggers, the dialog shell, slides, media and a close button.",
  sections: [
    {
      id: "source",
      title: "Source",
      blocks: [
        {
          kind: "text",
          text: "The docs app typechecks these files against the registry source, and the demo above renders them.",
        },
        { kind: "file", file: "minimal-lightbox.tsx" },
        photosFile,
      ],
    },
    {
      id: "what-it-does",
      title: "What it does",
      blocks: [
        {
          kind: "list",
          items: [
            "A press on a thumbnail morphs it into the viewer. Swipe, scroll sideways on a trackpad, or use the arrow keys to move between photos.",
            "Close with the button, Escape, or a pull up or down. The viewer morphs back onto the thumbnail of the photo it shows.",
            "There is no `OmbraZoom`, so the photos do not zoom, and no controls beyond close.",
            "`aria-label` on `OmbraContent` names the dialog. Each slide is named after its photo, so the image itself has empty `alt`.",
          ],
        },
      ],
    },
  ],
};

const fullGallery: Guide = {
  slug: "examples/full-gallery",
  title: "Full gallery",
  description:
    "The minimal lightbox plus zoom, previous and next, a counter, a caption, a thumbnail strip and chrome. This is OmbraGallery written out from the parts.",
  sections: [
    {
      id: "source",
      title: "Source",
      blocks: [
        {
          kind: "text",
          text: "The docs app typechecks these files against the registry source, and the demo above renders them. The icons come from `lucide-react`; any icon works.",
        },
        { kind: "file", file: "full-gallery.tsx" },
        photosFile,
      ],
    },
    {
      id: "what-it-adds",
      title: "What it adds",
      blocks: [
        {
          kind: "list",
          items: [
            "`OmbraZoom` around each slide's media: pinch, double-tap, Ctrl and the wheel, or the zoom buttons. Zoom stops where the photo shows at its natural size.",
            "`OmbraPrevious`, `OmbraNext` and `OmbraCounter`. The buttons disable themselves at the ends.",
            "`OmbraCaption` is the dialog description. `Dialog.Title` names the dialog after the photo on screen, read through `useOmbraState()`, so `Viewer` is a child of the root.",
            "`OmbraThumbnails` is a named navigation strip. With a single photo it renders nothing.",
            "`OmbraChrome` marks the regions a tap on the photo hides and a second tap shows.",
            "The `ombra-sheet` wrapper scales and rounds while the viewer is pulled to dismiss.",
          ],
        },
        {
          kind: "text",
          text: "The `OmbraGallery` recipe adds two things this example leaves out: it decodes the neighbouring photos ahead of a swipe, and it announces each photo's caption with the slide number.",
        },
      ],
    },
  ],
};

const guides: readonly Guide[] = [anatomy, minimal, fullGallery];

const EXAMPLES = "examples/";

export function listGuides(): readonly Guide[] {
  return guides;
}

export function guideBySlug(slug: string): Guide | undefined {
  return guides.find((guide) => guide.slug === slug);
}

/** The names under `/docs/examples`, such as `minimal`. */
export function exampleNames(): readonly string[] {
  return guides.flatMap((guide) =>
    guide.slug.startsWith(EXAMPLES) ? [guide.slug.slice(EXAMPLES.length)] : [],
  );
}

export function exampleGuide(name: string): Guide | undefined {
  return guideBySlug(`${EXAMPLES}${name}`);
}

export function guidePath(guide: Guide): string {
  return `/docs/${guide.slug}`;
}

export function guideMarkdownPath(guide: Guide): string {
  return `/docs/${guide.slug}.md`;
}

const sources = new Map<string, string>();

/** A file under `apps/docs/examples`, read once per server. */
export function exampleSource(file: string): string {
  const cached = sources.get(file);

  if (cached !== undefined) return cached;

  const source = readFileSync(join(process.cwd(), "examples", file), "utf8").trim();

  sources.set(file, source);

  return source;
}

/** The page links within the site; the Markdown is read elsewhere, so its links carry the origin. */
function absoluteLinks(text: string): string {
  return text.replaceAll("](/", `](${DOCS_ORIGIN}/`);
}

function blockMarkdown(block: GuideBlock): string {
  switch (block.kind) {
    case "text":
      return absoluteLinks(block.text);
    case "list":
      return block.items.map((item) => `- ${absoluteLinks(item)}`).join("\n");
    case "tree":
      return `\`\`\`text\n${block.text}\n\`\`\``;
    case "file": {
      const lang = block.file.endsWith(".tsx") ? "tsx" : "ts";

      return `\`${block.file}\`:\n\n\`\`\`${lang}\n${exampleSource(block.file)}\n\`\`\``;
    }
  }
}

export function markdownResponse(markdown: string | undefined): Response {
  if (markdown === undefined) return new Response("Not found", { status: 404 });

  return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}

export function guideMarkdown(guide: Guide): string {
  const sections = guide.sections.map(
    (section) => `## ${section.title}\n\n${section.blocks.map(blockMarkdown).join("\n\n")}`,
  );

  return `# ${guide.title}

${guide.description}

${sections.join("\n\n")}

Docs: ${DOCS_ORIGIN}${guidePath(guide)}
`;
}
