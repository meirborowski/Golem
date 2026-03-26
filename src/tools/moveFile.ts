import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

export function createMoveFileTool(fs: IFileSystem, context: AgentContext) {
  return tool({
    description:
      "Move or rename a file. Stages a delete of the source and a create of the destination. Both are subject to approval.",
    inputSchema: z.object({
      source: z.string().describe("Current file path"),
      destination: z.string().describe("New file path"),
    }),
    execute: async ({ source, destination }) => {
      try {
        if (!await fs.exists(source)) {
          return `Error: Source file ${source} does not exist.`;
        }
        if (await fs.exists(destination)) {
          return `Error: Destination ${destination} already exists.`;
        }

        const content = await fs.readFile(source);

        context.pendingChanges.push(
          {
            filePath: source,
            operation: "delete",
            originalContent: content,
            description: `Move to ${destination}`,
          },
          {
            filePath: destination,
            operation: "create",
            newContent: content,
            description: `Moved from ${source}`,
          },
        );

        return `Staged move: ${source} → ${destination}`;
      } catch (e) {
        return `Error moving file: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
