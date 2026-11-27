import type { Metadata } from "next";

import {
  playground,
  playgroundCombinations,
  playgroundKey,
  playgroundSnippet,
} from "../../../lib/playground";
import { CodeBlock } from "../code";
import { GuidePage } from "../guide-page";
import { Playground } from "./playground";

export const metadata: Metadata = {
  title: `${playground.title} — Ombra`,
  description: playground.description,
};

export default function PlaygroundPage() {
  const snippets = Object.fromEntries(
    playgroundCombinations().map((settings) => [
      playgroundKey(settings),
      <CodeBlock
        key={playgroundKey(settings)}
        code={playgroundSnippet(settings)}
        lang="tsx"
        title="photos.tsx"
      />,
    ]),
  );

  return <GuidePage guide={playground} demo={<Playground snippets={snippets} />} />;
}
