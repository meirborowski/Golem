import { tool } from "ai";
import { z } from "zod";
import type { IExecutionEnvironment } from "#core/interfaces/IExecutionEnvironment.js";

const MAX_DIFF_LENGTH = 10000;

export function createGitDiffTool(exec: IExecutionEnvironment, cwd?: string) {
  return tool({
    description:
      "Show git diff of changes. By default shows unstaged changes. Use staged=true to see staged changes.",
    inputSchema: z.object({
      path: z.string().optional().describe("Specific file path to diff"),
      staged: z.boolean().optional().describe("Show staged changes instead of unstaged (default: false)"),
    }),
    execute: async ({ path, staged }) => {
      try {
        const args = ["git", "diff"];
        if (staged) args.push("--cached");
        if (path) args.push("--", path);

        const result = await exec.execute(args.join(" "), cwd);
        if (result.exitCode !== 0) {
          return `Error: ${result.stderr || "git diff failed"}`;
        }

        const diff = result.stdout.trim();
        if (!diff) {
          return staged ? "No staged changes." : "No unstaged changes.";
        }

        if (diff.length > MAX_DIFF_LENGTH) {
          return diff.slice(0, MAX_DIFF_LENGTH) + `\n\n... truncated (${diff.length} total chars)`;
        }
        return diff;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
