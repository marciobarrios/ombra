import { indexMarkdown } from "../../../lib/agent-docs";

export function GET() {
  return new Response(indexMarkdown(), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
