import { tool } from "ai";
import { z } from "zod";

const MAX_CONTENT_LENGTH = 20000;

export function createWebFetchTool() {
  return tool({
    description:
      "Fetch content from a URL. Useful for reading documentation, API references, or issue details. Returns the raw text content.",
    inputSchema: z.object({
      url: z.string().url().describe("URL to fetch"),
      maxLength: z.number().optional().describe(`Max content length to return (default: ${MAX_CONTENT_LENGTH})`),
    }),
    execute: async ({ url, maxLength }) => {
      try {
        const limit = maxLength ?? MAX_CONTENT_LENGTH;
        const response = await fetch(url, {
          headers: { "User-Agent": "Golem/1.0" },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          return `HTTP ${response.status}: ${response.statusText}`;
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("text") && !contentType.includes("json") && !contentType.includes("xml")) {
          return `Binary content (${contentType}) — cannot display.`;
        }

        let text = await response.text();

        // Strip HTML tags for a rough text extraction
        if (contentType.includes("html")) {
          text = text
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }

        if (text.length > limit) {
          text = text.slice(0, limit) + `\n\n... truncated (${text.length} total chars)`;
        }

        return text;
      } catch (e) {
        return `Error fetching ${url}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
