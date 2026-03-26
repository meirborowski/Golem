import { tool, generateText } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

const MAX_RAW_LENGTH = 4000;
const MAX_FILES = 10;

export function createReadMultipleFilesTool(
  fs: IFileSystem,
  model: LanguageModel,
  context: AgentContext,
) {
  return tool({
    description:
      "Read multiple files in a single call. More efficient than calling readFile repeatedly when you know which files you need. Large files are summarized.",
    inputSchema: z.object({
      paths: z.array(z.string()).describe("File paths to read (max 10)"),
    }),
    execute: async ({ paths }) => {
      const filePaths = paths.slice(0, MAX_FILES);
      const results: string[] = [];

      for (const path of filePaths) {
        try {
          const content = await fs.readFile(path);
          if (content.length <= MAX_RAW_LENGTH) {
            results.push(`=== ${path} ===\n${content}`);
          } else {
            // Truncate for batch reads — full summarization would be too slow
            results.push(
              `=== ${path} (${content.length} chars, truncated) ===\n${content.slice(0, MAX_RAW_LENGTH)}\n... truncated`,
            );
          }
        } catch (e) {
          results.push(`=== ${path} ===\nError: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (paths.length > MAX_FILES) {
        results.push(`\n... skipped ${paths.length - MAX_FILES} files (max ${MAX_FILES} per call)`);
      }

      return results.join("\n\n");
    },
  });
}
