import { exampleGuide, guideMarkdown, markdownResponse } from "../../../../../lib/guides";

type MarkdownRouteProps = { params: Promise<{ example: string }> };

export async function GET(_request: Request, context: MarkdownRouteProps) {
  const guide = exampleGuide((await context.params).example);

  return markdownResponse(guide ? guideMarkdown(guide) : undefined);
}
