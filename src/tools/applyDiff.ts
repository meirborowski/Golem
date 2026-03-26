import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

export function createApplyDiffTool(fs: IFileSystem, context: AgentContext) {
  return tool({
    description:
      "Apply a unified diff to a file. More precise than editFile for multi-hunk changes. The diff should use standard unified diff format with @@ line markers. Changes are staged for approval.",
    inputSchema: z.object({
      path: z.string().describe("File path to patch"),
      diff: z.string().describe("Unified diff content (with @@ hunk headers)"),
    }),
    execute: async ({ path, diff }) => {
      try {
        if (!await fs.exists(path)) {
          return `Error: File ${path} does not exist.`;
        }

        const original = await fs.readFile(path);
        const lines = original.split("\n");
        const hunks = parseHunks(diff);

        if (hunks.length === 0) {
          return "Error: No valid hunks found in the diff. Use @@ -start,count +start,count @@ format.";
        }

        // Apply hunks in reverse order to preserve line numbers
        const sortedHunks = [...hunks].sort((a, b) => b.oldStart - a.oldStart);
        const result = [...lines];

        for (const hunk of sortedHunks) {
          const startIdx = hunk.oldStart - 1; // 0-indexed
          let removeCount = 0;
          const addLines: string[] = [];

          for (const line of hunk.lines) {
            if (line.startsWith("-")) {
              removeCount++;
            } else if (line.startsWith("+")) {
              addLines.push(line.slice(1));
            } else {
              // Context line — counts as both remove and add
              removeCount++;
              addLines.push(line.startsWith(" ") ? line.slice(1) : line);
            }
          }

          result.splice(startIdx, removeCount, ...addLines);
        }

        const newContent = result.join("\n");

        context.pendingChanges.push({
          filePath: path,
          operation: "modify",
          originalContent: original,
          newContent,
        });

        return `Staged ${hunks.length} hunk(s) applied to ${path}`;
      } catch (e) {
        return `Error applying diff to ${path}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

function parseHunks(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  const lines = diff.split("\n");
  let currentHunk: Hunk | null = null;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = {
        oldStart: parseInt(hunkMatch[1]),
        oldCount: parseInt(hunkMatch[2] ?? "1"),
        newStart: parseInt(hunkMatch[3]),
        newCount: parseInt(hunkMatch[4] ?? "1"),
        lines: [],
      };
    } else if (currentHunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      currentHunk.lines.push(line);
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}
