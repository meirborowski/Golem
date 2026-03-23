import { tool } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolvePath } from '../utils/file-utils.js';

/**
 * Apply a unified diff to file content.
 * Supports standard unified diff format with @@ -start,count +start,count @@ headers.
 */
function applyUnifiedDiff(original: string, diff: string): { result: string; hunksApplied: number } {
  const originalLines = original.split('\n');
  const diffLines = diff.split('\n');
  let hunksApplied = 0;

  // Parse hunks from the diff
  const hunks: Array<{
    oldStart: number;
    oldCount: number;
    removes: Map<number, string>;
    additions: Array<{ afterLine: number; lines: string[] }>;
  }> = [];

  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i];
    // Match hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (hunkMatch) {
      const oldStart = parseInt(hunkMatch[1], 10);
      const removes = new Map<number, string>();
      const additions: Array<{ afterLine: number; lines: string[] }> = [];
      let currentOldLine = oldStart;
      let pendingAdds: string[] = [];

      i++;
      while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
        const dLine = diffLines[i];
        if (dLine.startsWith('-')) {
          // Flush pending additions before this remove
          if (pendingAdds.length > 0) {
            additions.push({ afterLine: currentOldLine - 1, lines: pendingAdds });
            pendingAdds = [];
          }
          removes.set(currentOldLine, dLine.slice(1));
          currentOldLine++;
        } else if (dLine.startsWith('+')) {
          pendingAdds.push(dLine.slice(1));
        } else if (dLine.startsWith(' ') || dLine === '') {
          // Context line
          if (pendingAdds.length > 0) {
            additions.push({ afterLine: currentOldLine - 1, lines: pendingAdds });
            pendingAdds = [];
          }
          currentOldLine++;
        } else {
          // Unknown line — skip (could be "\ No newline at end of file")
        }
        i++;
      }

      // Flush remaining additions
      if (pendingAdds.length > 0) {
        additions.push({ afterLine: currentOldLine - 1, lines: pendingAdds });
      }

      hunks.push({
        oldStart,
        oldCount: parseInt(hunkMatch[2] ?? '1', 10),
        removes,
        additions,
      });
    } else {
      i++;
    }
  }

  if (hunks.length === 0) {
    throw new Error('No valid hunks found in the diff. Ensure it uses unified diff format with @@ headers.');
  }

  // Apply hunks in reverse order so line numbers stay valid
  hunks.sort((a, b) => b.oldStart - a.oldStart);

  const resultLines = [...originalLines];

  for (const hunk of hunks) {
    // Remove lines (in reverse to preserve indices)
    const removeLines = Array.from(hunk.removes.keys()).sort((a, b) => b - a);
    for (const lineNum of removeLines) {
      const idx = lineNum - 1;
      if (idx >= 0 && idx < resultLines.length) {
        resultLines.splice(idx, 1);
      }
    }

    // Add lines (process additions in reverse order)
    const sortedAdds = [...hunk.additions].sort((a, b) => b.afterLine - a.afterLine);
    for (const add of sortedAdds) {
      // Adjust insertion index for any removals that happened before this point
      let idx = add.afterLine;
      // Count how many removes happened at or before this line
      for (const removedLine of hunk.removes.keys()) {
        if (removedLine <= add.afterLine) {
          idx--;
        }
      }
      resultLines.splice(Math.max(0, idx), 0, ...add.lines);
    }

    hunksApplied++;
  }

  return { result: resultLines.join('\n'), hunksApplied };
}

export const patch = (cwd: string) =>
  Object.assign(
    tool({
      description:
        'Apply a unified diff patch to a file. Supports standard unified diff format with @@ hunk headers. Use this for multi-hunk edits that would be cumbersome with editFile. The diff should use - for removed lines, + for added lines, and space for context lines.',
      inputSchema: z.object({
        filePath: z.string().describe('Absolute or relative path to the file to patch'),
        diff: z.string().describe(
          'Unified diff to apply. Must include @@ -start,count +start,count @@ hunk headers. Lines starting with - are removed, + are added, space or empty are context.',
        ),
      }),
      execute: async ({ filePath, diff }) => {
        try {
          const resolved = resolvePath(filePath, cwd);

          if (!existsSync(resolved)) {
            return { success: false, error: `File not found: ${filePath}` };
          }

          const original = readFileSync(resolved, 'utf-8');
          const { result, hunksApplied } = applyUnifiedDiff(original, diff);

          writeFileSync(resolved, result, 'utf-8');

          return {
            success: true,
            filePath: resolved,
            hunksApplied,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),
    { whenToUse: 'When applying multi-hunk edits that would be cumbersome with editFile, or when you have a unified diff to apply.' },
  );
