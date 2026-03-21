import { tool } from 'ai';
import { z } from 'zod';
import { existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolvePath } from '../utils/file-utils.js';

export const rename = (cwd: string) =>
  tool({
    description:
      'Rename or move a file or directory. Both oldPath and newPath can be relative to the working directory or absolute.',
    inputSchema: z.object({
      oldPath: z.string().describe('Current path of the file or directory'),
      newPath: z.string().describe('New path for the file or directory'),
    }),
    execute: async ({ oldPath, newPath }) => {
      try {
        const resolvedOld = resolvePath(oldPath, cwd);
        const resolvedNew = resolvePath(newPath, cwd);

        if (!existsSync(resolvedOld)) {
          return { success: false, error: `Source not found: ${resolvedOld}` };
        }

        if (existsSync(resolvedNew)) {
          return { success: false, error: `Destination already exists: ${resolvedNew}` };
        }

        const destDir = dirname(resolvedNew);
        if (!existsSync(destDir)) {
          return { success: false, error: `Destination directory does not exist: ${destDir}` };
        }

        renameSync(resolvedOld, resolvedNew);

        return { success: true, oldPath: resolvedOld, newPath: resolvedNew };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
