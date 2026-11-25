import { guideBySlug, guideMarkdown } from "../../../../../lib/guides";

type MarkdownRouteProps = { params: Promise<{ example: string }> };

export async function GET(_request: Request, context: MarkdownRouteProps) {
  const { example } = await context.params;
  const guide = guideBySlug(`examples/${example}`);

  if (!guide) return new Response("Not found", { status: 404 });

  return new Response(guideMarkdown(guide), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
