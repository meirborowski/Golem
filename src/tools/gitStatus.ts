import { tool } from "ai";
import { z } from "zod";
import type { IExecutionEnvironment } from "#core/interfaces/IExecutionEnvironment.js";

export function createGitStatusTool(exec: IExecutionEnvironment, cwd?: string) {
  return tool({
    description:
      "Show the current git status — modified, staged, and untracked files.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const result = await exec.execute("git status --short", cwd);
        if (result.exitCode !== 0) {
          return `Error: ${result.stderr || "git status failed"}`;
        }
        return result.stdout.trim() || "Working tree clean — no changes.";
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
