import { tool } from 'ai';
import { z } from 'zod';

const DEFAULT_TIMEOUT = 15_000; // 15 seconds

interface SearxngResult {
  title: string;
  url: string;
  content: string;
}

interface SearxngResponse {
  results: SearxngResult[];
}

export const webSearch = (baseUrl: string) =>
  tool({
    description:
      'Search the web using SearXNG. Returns titles, URLs, and snippets. Use for looking up documentation, APIs, error messages, or any current information.',
    inputSchema: z.object({
      query: z.string().describe('The search query'),
      categories: z
        .union([z.string(), z.null()])
        .describe('Search categories: "general", "images", "news", "science", "it", etc. Null defaults to "general".'),
      language: z
        .union([z.string(), z.null()])
        .describe('Language code, e.g. "en", "he", "de". Null defaults to "en".'),
      maxResults: z
        .union([z.number(), z.null()])
        .describe('Maximum number of results to return. Null defaults to 10.'),
    }),
    execute: async ({ query, categories: rawCategories, language: rawLanguage, maxResults: rawMax }) => {
      const categories = rawCategories ?? 'general';
      const language = rawLanguage ?? 'en';
      const maxResults = rawMax ?? 10;

      try {
        const params = new URLSearchParams({
          q: query,
          format: 'json',
          categories,
          language,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

        const response = await fetch(`${baseUrl}/search?${params.toString()}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return {
            success: false,
            error: `SearXNG returned ${response.status} ${response.statusText}`,
          };
        }

        const data = (await response.json()) as SearxngResponse;

        const allResults = data.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
        }));

        const truncated = allResults.length > maxResults;
        const results = allResults.slice(0, maxResults);

        return {
          success: true,
          results,
          totalResults: allResults.length,
          truncated,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.name === 'AbortError'
              ? `Search timed out after ${DEFAULT_TIMEOUT}ms`
              : error.message
            : String(error);

        return {
          success: false,
          error: message,
        };
      }
    },
  });
