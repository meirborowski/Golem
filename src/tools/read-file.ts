import { tool } from 'ai';
import { z } from 'zod';
import { resolvePath, readFileSafe } from '../utils/file-utils.js';

export const readFile = (cwd: string) =>
  tool({
    description:
      'Read the contents of a file. Returns numbered lines. Use startLine/endLine for large files.',
    parameters: z.object({
      filePath: z.string().describe('Absolute or relative path to the file'),
      startLine: z.number().optional().describe('1-based start line (inclusive)'),
      endLine: z.number().optional().describe('1-based end line (inclusive)'),
    }),
    execute: async ({ filePath, startLine, endLine }) => {
      try {
        const resolved = resolvePath(filePath, cwd);
        const result = readFileSafe(resolved, { startLine, endLine });
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
