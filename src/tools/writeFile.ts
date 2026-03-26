import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "../core/interfaces/IFileSystem.js";
import type { AgentContext } from "../core/entities/AgentContext.js";

export function createWriteFileTool(fs: IFileSystem, context: AgentContext) {
  return tool({
    description: "Create or modify a file. Changes are staged for approval, not written immediately.",
    inputSchema: z.object({
      path: z.string().describe("File path to write"),
      content: z.string().describe("Full file content"),
    }),
    execute: async ({ path, content }) => {
      const existingContent = (await fs.exists(path))
        ? await fs.readFile(path)
        : undefined;

      context.pendingChanges.push({
        filePath: path,
        operation: existingContent !== undefined ? "modify" : "create",
        originalContent: existingContent,
        newContent: content,
      });

      return `Staged ${existingContent !== undefined ? "modification to" : "creation of"} ${path}`;
    },
  });
}
