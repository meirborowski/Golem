import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem, FileInfo } from "../core/interfaces/IFileSystem.js";
import { createIgnoreFilter } from "./gitignore.js";

const MAX_ENTRIES = 200;

export function createListDirectoryTool(fs: IFileSystem) {
  const getIgnoreFilter = createIgnoreFilter(fs);

  return tool({
    description: "List files and directories at the given path. Respects .gitignore patterns. Returns up to 200 entries.",
    inputSchema: z.object({
      path: z.string().describe("Directory path to list"),
      recursive: z.boolean().optional().describe("Whether to list recursively"),
    }),
    execute: async ({ path, recursive }) => {
      try {
        const filter = await getIgnoreFilter();
        const entries = await fs.listDirectory(path, recursive);
        const filtered = entries.filter((e: FileInfo) => !filter(e.path, e.isDirectory));
        const truncated = filtered.length > MAX_ENTRIES;
        const displayed = filtered.slice(0, MAX_ENTRIES);
        let result = displayed
          .map(e => `${e.isDirectory ? "[DIR]" : "[FILE]"} ${e.path}`)
          .join("\n");
        if (truncated) {
          result += `\n\n... and ${filtered.length - MAX_ENTRIES} more entries. Use a more specific path to see all files.`;
        }
        return result;
      } catch (e) {
        return `Error listing ${path}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
