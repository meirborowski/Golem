import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";

export function createCreateDirectoryTool(fs: IFileSystem) {
  return tool({
    description:
      "Create a directory (and any missing parent directories).",
    inputSchema: z.object({
      path: z.string().describe("Directory path to create"),
    }),
    execute: async ({ path }) => {
      try {
        await fs.mkdir(path);
        return `Created directory: ${path}`;
      } catch (e) {
        return `Error creating directory ${path}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
