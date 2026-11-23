import { itemDocByName, markdownFor } from "../../../../lib/agent-docs";

type MarkdownRouteProps = { params: Promise<{ item: string }> };

export async function GET(_request: Request, context: MarkdownRouteProps) {
  const { item } = await context.params;
  const doc = itemDocByName(item);

  if (!doc) return new Response("Not found", { status: 404 });

  return new Response(markdownFor(doc), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
