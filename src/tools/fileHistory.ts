import { tool } from "ai";
import { z } from "zod";
import type { IExecutionEnvironment } from "#core/interfaces/IExecutionEnvironment.js";

const MAX_OUTPUT_LENGTH = 10000;

export function createFileHistoryTool(exec: IExecutionEnvironment, cwd?: string) {
  return tool({
    description:
      "Show git commit history for a specific file, following renames. " +
      "Returns commit hash, date, author, message, and change stats per commit. " +
      "Use to understand why code looks the way it does before modifying it.",
    inputSchema: z.object({
      path: z.string().describe("File path to show history for"),
      count: z.number().optional().describe("Number of commits to show (default: 10)"),
      diff: z.boolean().optional().describe("Show patch diff per commit (default: false, can be very large)"),
    }),
    execute: async ({ path, count, diff }) => {
      try {
        const n = count ?? 10;
        const cmd = `git log --follow --oneline --stat -n${n}${diff ? " --patch" : ""} -- ${path}`;
        const result = await exec.execute(cmd, cwd);
        if (result.exitCode !== 0) {
          return `Error: ${result.stderr || "git log failed for " + path}`;
        }

        const output = result.stdout.trim();
        if (!output) {
          return `No history found for ${path}. The file may be untracked or not exist.`;
        }

        if (output.length > MAX_OUTPUT_LENGTH) {
          return output.slice(0, MAX_OUTPUT_LENGTH) + `\n\n... truncated (${output.length} total chars). Use a smaller count to reduce output.`;
        }
        return output;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
