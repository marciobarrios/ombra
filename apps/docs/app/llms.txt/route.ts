import { llmsTxt } from "../../lib/agent-docs";

export function GET() {
  return new Response(llmsTxt(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
