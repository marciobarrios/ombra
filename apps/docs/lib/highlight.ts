import { createHighlighterCore } from "shiki/core";
import type { HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import { readableOn } from "./contrast";

export type CodeLanguage = "tsx" | "bash" | "css";

/** One coloured run of text. `light` and `dark` are the two theme colours. */
export type CodeToken = { content: string; light: string; dark: string };

export type CodeLine = readonly CodeToken[];

const themes = { light: "ayu-light", dark: "ayu-dark" } as const;

/**
 * The `--card` colour behind every code panel, in each mode. Ayu Light's colours sit between
 * 2:1 and 3.4:1 on white, so each token is deepened to AA against these before it is used.
 */
const panels = { light: "#ffffff", dark: "#171717" } as const;

let highlighter: Promise<HighlighterCore> | undefined;

// The JavaScript regex engine and three grammars keep Shiki out of WebAssembly and the full bundle.
function loadHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [import("shiki/themes/ayu-light.mjs"), import("shiki/themes/ayu-dark.mjs")],
    langs: [
      import("shiki/langs/tsx.mjs"),
      import("shiki/langs/bash.mjs"),
      import("shiki/langs/css.mjs"),
    ],
    engine: createJavaScriptRegexEngine(),
  });

  return highlighter;
}

async function tokenize(code: string, lang: CodeLanguage): Promise<CodeLine[]> {
  const { tokens } = (await loadHighlighter()).codeToTokens(code, {
    lang,
    themes,
    defaultColor: false,
  });

  const colour = (value: string | undefined, panel: string) =>
    value ? readableOn(value, panel) : "inherit";

  return tokens.map((line) =>
    line.map((token) => ({
      content: token.content,
      light: colour(token.htmlStyle?.["--shiki-light"], panels.light),
      dark: colour(token.htmlStyle?.["--shiki-dark"], panels.dark),
    })),
  );
}

/** Highlights a whole snippet, one entry per line. */
export async function highlight(code: string, lang: CodeLanguage): Promise<CodeLine[]> {
  "use cache";

  return tokenize(code, lang);
}

/**
 * Highlights a TypeScript type or value on its own, such as `"flip" | "vt"` or `false`. A bare
 * fragment has no grammar context, so it is highlighted after `prefix` and the prefix is cut off.
 */
export async function highlightFragment(
  fragment: string,
  position: "type" | "value",
): Promise<CodeLine> {
  "use cache";

  const prefix = position === "type" ? "type _ = " : "const _ = ";
  const [line = []] = await tokenize(`${prefix}${fragment}`, "tsx");
  const kept: CodeToken[] = [];
  let offset = 0;

  for (const token of line) {
    const end = offset + token.content.length;

    if (end > prefix.length) {
      const cut = Math.max(0, prefix.length - offset);

      kept.push({ ...token, content: token.content.slice(cut) });
    }

    offset = end;
  }

  return kept;
}
