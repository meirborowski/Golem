import { tool, generateText } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import type { IFileSystem } from "../core/interfaces/IFileSystem.js";
import type { AgentContext } from "../core/entities/AgentContext.js";

const MAX_RAW_LENGTH = 4000;
const MAX_CONTENT_FOR_LLM = 50000;

const SUMMARIZATION_PROMPT = `You are a file summarization assistant for a coding agent. Given a file and the user's current task, extract only the parts that are relevant.

Rules:
- Keep imports, exports, type definitions, and function/class signatures intact
- Preserve code sections relevant to the user's task
- Omit large implementation blocks that aren't relevant to the task
- Use "// ... (N lines omitted)" to indicate removed sections
- Never invent content not in the original file
- For non-code files (README, config), extract only sections relevant to the task
- Output the distilled file content directly, no commentary`;

export function createReadFileTool(
  fs: IFileSystem,
  model: LanguageModel,
  context: AgentContext,
) {
  return tool({
    description:
      "Read the contents of a file. Large files are automatically summarized to show only the parts relevant to your current task.",
    inputSchema: z.object({
      path: z.string().describe("File path to read"),
    }),
    execute: async ({ path }) => {
      try {
        const content = await fs.readFile(path);

        if (content.length <= MAX_RAW_LENGTH) {
          return content;
        }

        // Large file: use LLM to extract relevant parts
        const toSummarize = content.length > MAX_CONTENT_FOR_LLM
          ? content.slice(0, MAX_CONTENT_FOR_LLM) + `\n\n... (truncated, ${content.length} total chars)`
          : content;

        try {
          const { text } = await generateText({
            model,
            messages: [
              { role: "system", content: SUMMARIZATION_PROMPT },
              {
                role: "user",
                content: `Current task: ${context.currentRequest || "General exploration"}\n\nFile: ${path} (${content.length} chars)\n\n${toSummarize}`,
              },
            ],
          });
          return `[Summarized — full file is ${content.length} chars]\n${text}`;
        } catch {
          // LLM failed, fall back to truncation
          return content.slice(0, MAX_RAW_LENGTH) + `\n\n... truncated (${content.length} total chars). Use a more specific request if you need the full file.`;
        }
      } catch (e) {
        return `Error reading ${path}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
