import type { MorphEngine } from "../../../registry/ombra/types";
import type { Guide } from "./guides";

/**
 * The playground's settings and the code each one maps to. No React here, so the page can
 * highlight every snippet on the server and the client only picks one.
 */

export type PlaygroundLayout = "gallery" | "album";

export type PlaygroundSettings = {
  layout: PlaygroundLayout;
  morph: MorphEngine;
  reducedMotion: boolean;
};

export const PLAYGROUND_LAYOUTS: readonly { value: PlaygroundLayout; label: string }[] = [
  { value: "gallery", label: "Gallery" },
  { value: "album", label: "Album" },
];

export const PLAYGROUND_MORPHS: readonly { value: MorphEngine; label: string }[] = [
  { value: "flip", label: "FLIP" },
  { value: "vt", label: "View Transitions" },
  { value: "fade", label: "Fade" },
];

export const PLAYGROUND_DEFAULTS: PlaygroundSettings = {
  layout: "gallery",
  morph: "flip",
  reducedMotion: false,
};

export const PLAYGROUND_ALBUM_TITLE = "Four landscapes";

/** Every combination of settings, so the page can prepare each snippet ahead of time. */
export function playgroundCombinations(): readonly PlaygroundSettings[] {
  return PLAYGROUND_LAYOUTS.flatMap(({ value: layout }) =>
    PLAYGROUND_MORPHS.flatMap(({ value: morph }) =>
      [false, true].map((reducedMotion) => ({ layout, morph, reducedMotion })),
    ),
  );
}

export function playgroundKey(settings: PlaygroundSettings): string {
  return `${settings.layout}:${settings.morph}:${settings.reducedMotion ? "reduced" : "full"}`;
}

/** Reduced motion is the visitor's setting, not a prop: whatever morph is asked for, it fades. */
export function playgroundMorph(settings: PlaygroundSettings): MorphEngine {
  return settings.reducedMotion ? "fade" : settings.morph;
}

/** The JSX the settings stand for, as a consumer would write it. */
export function playgroundSnippet(settings: PlaygroundSettings): string {
  const recipe = settings.layout === "gallery" ? "OmbraGallery" : "OmbraAlbum";
  const file = settings.layout === "gallery" ? "ombra-gallery" : "ombra-album";

  const props =
    settings.layout === "gallery"
      ? ["items={photos}"]
      : [`title="${PLAYGROUND_ALBUM_TITLE}"`, "photos={photos}"];

  // One prop a line, so the snippet fits a phone without scrolling sideways.
  const lines = [...props, `morph="${settings.morph}"`].map((prop) => `      ${prop}`);

  const note = settings.reducedMotion ? "\n  // Reduced motion fades any morph." : "";

  return `import { ${recipe} } from "@/components/ombra/${file}";

export function Photos() {${note}
  return (
    <${recipe}
${lines.join("\n")}
    />
  );
}`;
}

export const playground: Guide = {
  slug: "playground",
  title: "Playground",
  description:
    "Switch the layout, the morph engine and reduced motion, and see the props each choice maps to.",
  sections: [
    {
      id: "controls",
      title: "What the controls change",
      blocks: [
        {
          kind: "list",
          items: [
            "**Layout** picks the recipe: `OmbraGallery`, a grid that opens on the photo you press, or `OmbraAlbum`, one cover that opens on the first photo.",
            "**Morph** is the `morph` prop on either recipe, passed through to `OmbraRoot`: `flip` (the default), `vt` or `fade`. A browser without View Transitions runs FLIP for `vt`.",
            "**Reduced motion** shows the morph a visitor with `prefers-reduced-motion: reduce` gets. It is not a prop: the viewer reads the setting itself and fades whatever morph you pass. With the setting on in your system, every morph here fades too.",
          ],
        },
        {
          kind: "text",
          text: "The recipes are files in your project, so a change past these props is an edit to their JSX. See [Recipes](/docs/recipes) and the [API reference](/docs/api).",
        },
      ],
    },
  ],
};
