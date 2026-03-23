import { tool } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolvePath } from '../utils/file-utils.js';

export const multiEdit = (cwd: string) =>
  Object.assign(
    tool({
      description:
        'Apply multiple find-and-replace edits to a single file in one call. Edits are applied sequentially — each edit operates on the result of the previous one. If any edit fails, the file is left unchanged.',
      inputSchema: z.object({
        filePath: z.string().describe('Path to the file to edit (relative to cwd or absolute)'),
        edits: z
          .array(
            z.object({
              oldText: z.string().describe('Exact text to find (must be unique in the file)'),
              newText: z.string().describe('Replacement text'),
            }),
          )
          .min(1)
          .describe('Array of find-replace pairs, applied sequentially'),
      }),
      execute: async ({ filePath, edits }) => {
        try {
          const resolved = resolvePath(filePath, cwd);

          if (!existsSync(resolved)) {
            return { success: false, error: `File not found: ${resolved}` };
          }

          let content = readFileSync(resolved, 'utf-8');
          const original = content;

          for (let i = 0; i < edits.length; i++) {
            const { oldText, newText } = edits[i];
            const occurrences = content.split(oldText).length - 1;

            if (occurrences === 0) {
              // Revert — don't write partial changes
              return {
                success: false,
                error: `Edit ${i + 1}/${edits.length}: old text not found in file.`,
              };
            }

            if (occurrences > 1) {
              return {
                success: false,
                error: `Edit ${i + 1}/${edits.length}: found ${occurrences} occurrences of old text. Include more context to make the match unique.`,
              };
            }

            content = content.replace(oldText, newText);
          }

          // Only write if something actually changed
          if (content !== original) {
            writeFileSync(resolved, content, 'utf-8');
          }

          return { success: true, filePath: resolved, editsApplied: edits.length };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),
    { whenToUse: 'When making multiple find-and-replace changes in the same file. More efficient than calling editFile repeatedly.' },
  );
