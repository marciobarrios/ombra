import { itemDocByName, markdownFor } from "../../../../lib/agent-docs";
import { guideBySlug, guideMarkdown } from "../../../../lib/guides";

type MarkdownRouteProps = { params: Promise<{ item: string }> };

function markdownForPage(name: string): string | undefined {
  const doc = itemDocByName(name);

  if (doc) return markdownFor(doc);

  const guide = guideBySlug(name);

  return guide ? guideMarkdown(guide) : undefined;
}

export async function GET(_request: Request, context: MarkdownRouteProps) {
  const { item } = await context.params;
  const markdown = markdownForPage(item);

  if (markdown === undefined) return new Response("Not found", { status: 404 });

  return new Response(markdown, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
