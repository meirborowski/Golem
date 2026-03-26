import { tool } from "ai";
import { z } from "zod";
import type { IExecutionEnvironment } from "#core/interfaces/IExecutionEnvironment.js";

export function createGitLogTool(exec: IExecutionEnvironment, cwd?: string) {
  return tool({
    description:
      "Show recent git commit history. Useful for understanding what changed recently and following commit message conventions.",
    inputSchema: z.object({
      count: z.number().optional().describe("Number of commits to show (default: 10)"),
      path: z.string().optional().describe("Show commits affecting a specific file"),
      oneline: z.boolean().optional().describe("Compact one-line format (default: true)"),
    }),
    execute: async ({ count, path, oneline }) => {
      try {
        const n = count ?? 10;
        const format = oneline !== false ? "--oneline" : "--format=medium";
        const args = ["git", "log", format, `-${n}`];
        if (path) args.push("--", path);

        const result = await exec.execute(args.join(" "), cwd);
        if (result.exitCode !== 0) {
          return `Error: ${result.stderr || "git log failed"}`;
        }
        return result.stdout.trim() || "No commits found.";
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
