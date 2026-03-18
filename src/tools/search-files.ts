import { tool } from 'ai';
import { z } from 'zod';
import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface SearchMatch {
  file: string;
  line: number;
  content: string;
  context: string[];
}

export const searchFiles = (cwd: string) =>
  tool({
    description:
      'Search file contents using a regex pattern. Returns matching lines with surrounding context. Respects .gitignore.',
    parameters: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      glob: z
        .string()
        .optional()
        .default('**/*')
        .describe('Glob pattern to filter which files to search'),
      maxResults: z.number().optional().default(50).describe('Maximum number of matches to return'),
      contextLines: z
        .number()
        .optional()
        .default(2)
        .describe('Number of lines of context around each match'),
    }),
    execute: async ({ pattern, glob, maxResults, contextLines }) => {
      try {
        const regex = new RegExp(pattern, 'gi');

        const files = await fg(glob, {
          cwd,
          dot: false,
          onlyFiles: true,
          ignore: ['node_modules/**', '.git/**', 'dist/**', '*.lock'],
        });

        const matches: SearchMatch[] = [];

        for (const file of files) {
          if (matches.length >= maxResults) break;

          try {
            const content = readFileSync(join(cwd, file), 'utf-8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= maxResults) break;

              if (regex.test(lines[i]!)) {
                const ctxStart = Math.max(0, i - contextLines);
                const ctxEnd = Math.min(lines.length - 1, i + contextLines);
                const context = lines.slice(ctxStart, ctxEnd + 1).map((l: string, idx: number) => {
                  const lineNum = ctxStart + idx + 1;
                  const marker = ctxStart + idx === i ? '>' : ' ';
                  return `${marker} ${String(lineNum).padStart(4)} | ${l}`;
                });

                matches.push({
                  file,
                  line: i + 1,
                  content: lines[i]!.trim(),
                  context,
                });
              }

              // Reset regex lastIndex for global flag
              regex.lastIndex = 0;
            }
          } catch {
            // Skip binary or unreadable files
          }
        }

        return {
          success: true,
          matches,
          totalMatches: matches.length,
          truncated: matches.length >= maxResults,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
