import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "../core/interfaces/IFileSystem.js";

export function createReadFileTool(fs: IFileSystem) {
  return tool({
    description: "Read the contents of a file at the given path",
    inputSchema: z.object({
      path: z.string().describe("File path to read"),
    }),
    execute: async ({ path }) => {
      const content = await fs.readFile(path);
      return content;
    },
  });
}
