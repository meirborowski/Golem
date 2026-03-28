import { tool } from "ai";
import { z } from "zod";
import type { IExecutionEnvironment } from "#core/interfaces/IExecutionEnvironment.js";

const MAX_OUTPUT_LENGTH = 10000;

export function createGitShowTool(exec: IExecutionEnvironment, cwd?: string) {
  return tool({
    description:
      "Show the details of a specific git commit — its message and diff. Useful for understanding what a past commit changed and why.",
    inputSchema: z.object({
      commit: z.string().describe("Commit hash or ref (e.g. 'HEAD', 'abc1234', 'main~3')"),
      stat: z.boolean().optional().describe("Show file change summary instead of full diff (default: false)"),
    }),
    execute: async ({ commit, stat }) => {
      try {
        const args = ["git", "show", commit];
        if (stat) args.push("--stat");

        const result = await exec.execute(args.join(" "), cwd);
        if (result.exitCode !== 0) {
          return `Error: ${result.stderr || "git show failed"}`;
        }

        const output = result.stdout.trim();
        if (!output) {
          return `No output for commit ${commit}.`;
        }

        if (output.length > MAX_OUTPUT_LENGTH) {
          return output.slice(0, MAX_OUTPUT_LENGTH) + `\n\n... truncated (${output.length} total chars). Use stat=true for a summary.`;
        }
        return output;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
