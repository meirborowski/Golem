import { tool } from "ai";
import { z } from "zod";
import type { IExecutionEnvironment } from "#core/interfaces/IExecutionEnvironment.js";

export function createGitCommitTool(exec: IExecutionEnvironment, cwd?: string) {
  return tool({
    description:
      "Stage files and create a git commit. If no files are specified, stages all modified/new files.",
    inputSchema: z.object({
      message: z.string().describe("Commit message"),
      files: z.array(z.string()).optional().describe("Specific files to stage (default: all changes)"),
    }),
    execute: async ({ message, files }) => {
      try {
        // Stage files
        const addCmd = files && files.length > 0
          ? `git add ${files.map((f) => `"${f}"`).join(" ")}`
          : "git add -A";

        const addResult = await exec.execute(addCmd, cwd);
        if (addResult.exitCode !== 0) {
          return `Error staging files: ${addResult.stderr}`;
        }

        // Commit
        const escapedMessage = message.replace(/"/g, '\\"');
        const commitResult = await exec.execute(`git commit -m "${escapedMessage}"`, cwd);
        if (commitResult.exitCode !== 0) {
          return `Error committing: ${commitResult.stderr}`;
        }

        return commitResult.stdout.trim();
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
