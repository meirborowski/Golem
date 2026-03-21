import { tool } from 'ai';
import { z } from 'zod';
import { resolvePath, editFileSafe } from '../utils/file-utils.js';

export const editFile = (cwd: string) =>
  tool({
    description:
      'Apply a text replacement to a file. The oldText must match exactly and uniquely in the file. Provide enough surrounding context to ensure a unique match.',
    inputSchema: z.object({
      filePath: z.string().describe('Path to the file to edit'),
      oldText: z.string().describe('Exact text to find (must match uniquely in the file)'),
      newText: z.string().describe('Replacement text'),
    }),
    execute: async ({ filePath, oldText, newText }) => {
      try {
        const resolved = resolvePath(filePath, cwd);
        const result = editFileSafe(resolved, oldText, newText);
        return {
          success: true,
          filePath: resolved,
          linesChanged: result.linesChanged,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
