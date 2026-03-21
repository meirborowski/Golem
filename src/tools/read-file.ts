import { tool } from 'ai';
import { z } from 'zod';
import { resolvePath, readFileSafe } from '../utils/file-utils.js';

export const readFile = (cwd: string) =>
  tool({
    description:
      'Read the contents of a file. Returns numbered lines. Use startLine/endLine for large files.',
    inputSchema: z.object({
      filePath: z.string().describe('Absolute or relative path to the file'),
      startLine: z.union([z.number(), z.null()]).describe('1-based start line (inclusive), or null to read from beginning'),
      endLine: z.union([z.number(), z.null()]).describe('1-based end line (inclusive), or null to read to end'),
    }),
    execute: async ({ filePath, startLine, endLine }) => {
      try {
        const resolved = resolvePath(filePath, cwd);
        const result = readFileSafe(resolved, {
          startLine: startLine ?? undefined,
          endLine: endLine ?? undefined,
        });
        return {
          success: true,
          filePath: resolved,
          totalLines: result.totalLines,
          linesRead: result.linesRead,
          content: result.content,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
