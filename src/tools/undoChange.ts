import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "#core/entities/AgentContext.js";

export function createUndoChangeTool(context: AgentContext) {
  return tool({
    description:
      "Remove pending file change(s) from the staging area before human approval. " +
      "Use when you staged a change by mistake or want to redo it differently.",
    inputSchema: z.object({
      filePath: z.string().describe("Path of the file to remove from pending changes"),
    }),
    execute: async ({ filePath }) => {
      const before = context.pendingChanges.length;
      const removed = context.pendingChanges.filter((c) => c.filePath === filePath);

      if (removed.length === 0) {
        const paths = context.pendingChanges.map((c) => c.filePath);
        if (paths.length === 0) {
          return `No pending changes to undo.`;
        }
        return `No pending changes found for "${filePath}". Current pending files: ${paths.join(", ")}`;
      }

      context.pendingChanges = context.pendingChanges.filter((c) => c.filePath !== filePath);
      const remaining = context.pendingChanges.length;

      return `Removed ${removed.length} pending change(s) for "${filePath}". ${remaining} change(s) remaining.`;
    },
  });
}
