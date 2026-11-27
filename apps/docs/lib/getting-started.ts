import type { Guide, GuideBlock } from "./guides";
import { itemContents, registryItems } from "./install";
import type { RegistryItem } from "./install";

/** The Getting started pages: introduction, installation and quick start. */

export const introduction: Guide = {
  slug: "introduction",
  title: "Introduction",
  description:
    "Ombra is a React lightbox you copy into your project. A pressed photo morphs into a full-screen viewer, and the viewer closes back onto it.",
  sections: [
    {
      id: "what-it-is",
      title: "What Ombra is",
      blocks: [
        {
          kind: "text",
          text: "Ombra turns the photos on a page into a lightbox. Press one and it grows into a full-screen viewer. Swipe, scroll sideways on a trackpad or use the arrow keys to move between photos, pinch or double-tap to zoom, and pull up or down to close. The viewer closes back onto the thumbnail of the photo it shows.",
        },
        {
          kind: "text",
          text: "You build the lightbox from parts in JSX: a root that holds the state, a trigger per photo, the dialog, the slides and any controls you want. Two recipes, a grid gallery and a single-cover album, are lightboxes already written from those parts. [Anatomy](/docs/anatomy) shows how the parts fit together.",
        },
      ],
    },
    {
      id: "copied-source",
      title: "You own the source",
      blocks: [
        {
          kind: "text",
          text: "Ombra is a shadcn registry, not an npm package. The shadcn CLI copies its files into `components/ombra` in your project, and from then on they are your code: change the markup, the classes or the behaviour as you would any other component.",
        },
        {
          kind: "list",
          items: [
            "There is no package to update and no version to pin. To take a newer Ombra, run the add command again with `--overwrite` and review the diff in version control.",
            "The files import each other by relative path, so keep them together in one directory.",
            "The styles are Tailwind CSS classes, merged through `cn()`, so a `className` you pass wins over the default.",
          ],
        },
      ],
    },
    {
      id: "dependencies",
      title: "Dependencies",
      blocks: [
        {
          kind: "list",
          items: [
            "**React 19.**",
            "**`@base-ui/react`** for the dialog: focus trapping, the inert page behind it, scroll locking and the accessible name.",
            "**`cn`** to merge class names.",
          ],
        },
        {
          kind: "text",
          text: "There is no animation library. The morph runs on the Web Animations API, or on a View Transition when you ask for one. The slides are a native CSS scroll-snap track. Pull to dismiss and zoom are pointer events and CSS transforms. Values that change every frame live in CSS variables, so a drag does not re-render React.",
        },
      ],
    },
    {
      id: "browser-support",
      title: "Browser support",
      blocks: [
        {
          kind: "text",
          text: "Ombra supports current browsers on desktop and mobile: Chrome, Edge, Safari on macOS and iOS, and Firefox. It uses `@property`, dynamic viewport units and `Array.prototype.toSorted`, so the oldest versions that run it are Chrome and Edge 110, Safari 16.4 and Firefox 128.",
        },
        {
          kind: "list",
          items: [
            "`flip`, the default morph, runs wherever the Web Animations API does. `vt` needs View Transitions, and runs `flip` in a browser without them.",
            "With reduced motion on, every morph is a short fade.",
            "The automated tests run in Chromium and WebKit, on a desktop window and on phone-sized touch screens.",
          ],
        },
      ],
    },
    {
      id: "next",
      title: "Next",
      blocks: [
        {
          kind: "list",
          items: [
            "[Installation](/docs/installation): the command for each registry item and the files it adds.",
            "[Quick start](/docs/quick-start): the smallest working lightbox, built from the parts.",
          ],
        },
      ],
    },
  ],
};

function fileTree(directory: string, files: readonly string[]): string {
  const lines = files.map((file, index) => `${index === files.length - 1 ? "└──" : "├──"} ${file}`);

  return [`${directory}/`, ...lines].join("\n");
}

function code(names: readonly string[]): string {
  const quoted = names.map((name) => `\`${name}\``);

  if (quoted.length < 2) return quoted.join("");

  return `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
}

/** What `shadcn add` writes for one item, read from `registry.json`. */
function itemSection(item: RegistryItem): Guide["sections"][number] {
  const contents = itemContents(item);

  const adds = [
    `${contents.files.length} files in \`${contents.directory}\`.`,
    ...(contents.dependencies.length > 0
      ? [`The npm packages ${code(contents.dependencies)}.`]
      : []),
    ...(contents.registryDependencies.length > 0
      ? [
          `shadcn's ${code(contents.registryDependencies)} item (\`lib/utils.ts\`), when your project does not have it yet.`,
        ]
      : []),
    ...(contents.css
      ? [
          "Rules in your global CSS file for pull to dismiss, hiding the chrome, and forced colours.",
        ]
      : []),
  ];

  const blocks: GuideBlock[] = [
    { kind: "text", text: item.description },
    { kind: "install", item: item.name },
    { kind: "text", text: "It adds:" },
    { kind: "list", items: adds },
    { kind: "tree", text: fileTree(contents.directory, contents.files) },
  ];

  return { id: item.name, title: item.name, blocks };
}

export const installation: Guide = {
  slug: "installation",
  title: "Installation",
  description:
    "Add Ombra with the shadcn CLI. Each registry item has one command, and copies its files into your project.",
  sections: [
    {
      id: "requirements",
      title: "Requirements",
      blocks: [
        {
          kind: "list",
          items: [
            "A React 19 project with Tailwind CSS 4 and TypeScript 5 or later, such as a Next.js App Router or Vite app.",
            "shadcn set up in it. Run `npx shadcn init` once if the project has no `components.json`. The examples in these docs import from `@/components/ombra`, through shadcn's default `@/` alias.",
          ],
        },
        {
          kind: "text",
          text: "Most projects want `ombra`, the whole lightbox. It already includes the files of `ombra-morph` and `ombra-zoom`. Install one of those alone only to use a helper without the lightbox.",
        },
      ],
    },
    ...registryItems().map(itemSection),
    {
      id: "next",
      title: "Next",
      blocks: [
        {
          kind: "text",
          text: "Build your first lightbox in the [Quick start](/docs/quick-start).",
        },
      ],
    },
  ],
};

export const quickStart: Guide = {
  slug: "quick-start",
  title: "Quick start",
  description:
    "The smallest working lightbox, built from the parts: a grid of photos that open into a viewer you can swipe through and close.",
  sections: [
    {
      id: "install",
      title: "1. Install",
      blocks: [
        {
          kind: "text",
          text: "In a React project with shadcn set up (see [Installation](/docs/installation)), add the `ombra` item:",
        },
        { kind: "install", item: "ombra" },
      ],
    },
    {
      id: "photos",
      title: "2. List your photos",
      blocks: [
        {
          kind: "text",
          text: "Each photo needs a stable `id`, alt text, a file for the viewer and a smaller one for the grid, and its intrinsic `width` and `height`, so the viewer can fit it before the file loads. These point at files under `public/photos`; use your own.",
        },
        { kind: "file", file: "photos.ts", title: "app/photos.ts" },
      ],
    },
    {
      id: "lightbox",
      title: "3. Write the lightbox",
      blocks: [
        {
          kind: "text",
          text: "`OmbraRoot` holds the state. Each `OmbraTrigger` opens its photo, and `OmbraPortal` renders the viewer: a backdrop, and the dialog with a close button and one slide per photo.",
        },
        { kind: "file", file: "minimal-lightbox.tsx", title: "app/minimal-lightbox.tsx" },
        {
          kind: "list",
          items: [
            "The `itemId` on each trigger and slide matches an entry in `itemIds`. That is how the viewer knows which thumbnail to close back onto.",
            "`aria-label` on `OmbraContent` names the dialog, and the close button needs a label too. Ombra ships no visible text, so the words are yours.",
            "The thumbnail image needs a laid-out size and `object-fit`, so the morph has a box to start from.",
          ],
        },
      ],
    },
    {
      id: "render",
      title: "4. Render it",
      blocks: [
        {
          kind: "text",
          text: "The parts are client components, so a Server Component page can render the lightbox as it is.",
        },
        { kind: "file", file: "quick-start-page.tsx", title: "app/page.tsx" },
        {
          kind: "text",
          text: "Press a photo, swipe or use the arrow keys, then close with the button, Escape, or a pull up or down. The demo above is this code.",
        },
      ],
    },
    {
      id: "next",
      title: "Next",
      blocks: [
        {
          kind: "list",
          items: [
            "[Full gallery](/docs/examples/full-gallery): add zoom, previous and next, a counter and a thumbnail strip.",
            "[Recipes](/docs/recipes): start from a finished gallery or album instead.",
            "[Anatomy](/docs/anatomy) and the [API reference](/docs/api): every part and its props.",
          ],
        },
      ],
    },
  ],
};
