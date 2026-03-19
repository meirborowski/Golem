import { tool } from 'ai';
import { z } from 'zod';
import fg from 'fast-glob';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const listFiles = (cwd: string) =>
  tool({
    description:
      'List files matching a glob pattern. Respects .gitignore. Returns paths relative to the working directory.',
    parameters: z.object({
      pattern: z.string().describe('Glob pattern, e.g. "src/**/*.ts" or "**/*.json"'),
      maxResults: z.union([z.number(), z.null()]).describe('Maximum number of files to return. Null defaults to 100.'),
    }),
    execute: async ({ pattern, maxResults: rawMax }) => {
      const maxResults = rawMax ?? 100;
      try {
        // Load .gitignore patterns if present
        const gitignorePath = join(cwd, '.gitignore');
        const ignorePatterns: string[] = ['node_modules', '.git', 'dist'];
        if (existsSync(gitignorePath)) {
          const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
          ignorePatterns.push(
            ...gitignoreContent
              .split('\n')
              .map((l: string) => l.trim())
              .filter((l: string) => l && !l.startsWith('#')),
          );
        }

        const allFiles = await fg(pattern, {
          cwd,
          dot: false,
          onlyFiles: true,
          ignore: ignorePatterns.map((p) => (p.includes('/') ? p : `**/${p}/**`)),
        });

        const truncated = allFiles.length > maxResults;
        const files = allFiles.slice(0, maxResults);

        return {
          success: true,
          files,
          totalMatches: allFiles.length,
          truncated,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
