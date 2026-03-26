import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

export function createDeleteFileTool(fs: IFileSystem, context: AgentContext) {
  return tool({
    description:
      "Delete a file. The deletion is staged for approval, not immediate.",
    inputSchema: z.object({
      path: z.string().describe("File path to delete"),
    }),
    execute: async ({ path }) => {
      try {
        if (!await fs.exists(path)) {
          return `Error: File ${path} does not exist.`;
        }

        const content = await fs.readFile(path);

        context.pendingChanges.push({
          filePath: path,
          operation: "delete",
          originalContent: content,
        });

        return `Staged deletion of ${path}`;
      } catch (e) {
        return `Error staging deletion of ${path}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
