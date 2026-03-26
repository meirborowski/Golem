import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "../core/interfaces/IFileSystem.js";

export function createListDirectoryTool(fs: IFileSystem) {
  return tool({
    description: "List files and directories at the given path",
    inputSchema: z.object({
      path: z.string().describe("Directory path to list"),
      recursive: z.boolean().optional().describe("Whether to list recursively"),
    }),
    execute: async ({ path, recursive }) => {
      const entries = await fs.listDirectory(path, recursive);
      return entries
        .map(e => `${e.isDirectory ? "[DIR]" : "[FILE]"} ${e.path}`)
        .join("\n");
    },
  });
}
