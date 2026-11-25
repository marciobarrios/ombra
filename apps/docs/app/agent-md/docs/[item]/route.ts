import { itemDocByName, markdownFor } from "../../../../lib/agent-docs";
import { guideBySlug, guideMarkdown, markdownResponse } from "../../../../lib/guides";

type MarkdownRouteProps = { params: Promise<{ item: string }> };

/** A registry item's page, or a top-level guide such as the anatomy. */
function markdownForPage(name: string): string | undefined {
  const doc = itemDocByName(name);

  if (doc) return markdownFor(doc);

  const guide = guideBySlug(name);

  return guide ? guideMarkdown(guide) : undefined;
}

export async function GET(_request: Request, context: MarkdownRouteProps) {
  return markdownResponse(markdownForPage((await context.params).item));
}
