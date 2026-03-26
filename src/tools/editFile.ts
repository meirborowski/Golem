import { tool } from "ai";
import { z } from "zod";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

export function createEditFileTool(fs: IFileSystem, context: AgentContext) {
  return tool({
    description:
      "Make a targeted edit to a file by replacing a specific string. More efficient than writeFile for small changes — you don't need to reproduce the entire file. The oldText must match exactly (including whitespace and indentation). Changes are staged for approval.",
    inputSchema: z.object({
      path: z.string().describe("File path to edit"),
      oldText: z.string().describe("Exact text to find and replace (must be unique in the file)"),
      newText: z.string().describe("Replacement text"),
    }),
    execute: async ({ path, oldText, newText }) => {
      try {
        if (!await fs.exists(path)) {
          return `Error: File ${path} does not exist. Use writeFile to create new files.`;
        }

        const content = await fs.readFile(path);
        const occurrences = content.split(oldText).length - 1;

        if (occurrences === 0) {
          return `Error: Could not find the specified text in ${path}. Make sure the oldText matches exactly, including whitespace and indentation.`;
        }

        if (occurrences > 1) {
          return `Error: Found ${occurrences} occurrences of the specified text in ${path}. The oldText must be unique — include more surrounding context to disambiguate.`;
        }

        const newContent = content.replace(oldText, newText);

        context.pendingChanges.push({
          filePath: path,
          operation: "modify",
          originalContent: content,
          newContent,
        });

        return `Staged edit to ${path} (replaced ${oldText.length} chars with ${newText.length} chars)`;
      } catch (e) {
        return `Error editing ${path}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
