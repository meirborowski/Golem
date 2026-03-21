import { tool } from 'ai';
import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolvePath } from '../utils/file-utils.js';

export const writeFile = (cwd: string) =>
  tool({
    description:
      'Create or overwrite a file with the given content. Creates parent directories if they do not exist.',
    inputSchema: z.object({
      filePath: z.string().describe('Path to the file to create or overwrite'),
      content: z.string().describe('The full content to write to the file'),
    }),
    execute: async ({ filePath, content }) => {
      try {
        const resolved = resolvePath(filePath, cwd);
        mkdirSync(dirname(resolved), { recursive: true });
        writeFileSync(resolved, content, 'utf-8');

        return {
          success: true,
          filePath: resolved,
          bytesWritten: Buffer.byteLength(content, 'utf-8'),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
