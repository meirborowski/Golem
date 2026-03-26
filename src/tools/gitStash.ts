import { tool } from "ai";
import { z } from "zod";
import type { IExecutionEnvironment } from "#core/interfaces/IExecutionEnvironment.js";

export function createGitStashTool(exec: IExecutionEnvironment, cwd?: string) {
  return tool({
    description:
      "Manage git stash — save, restore, or list stashed changes.",
    inputSchema: z.object({
      action: z.enum(["push", "pop", "list"]).describe("Stash action to perform"),
      message: z.string().optional().describe("Message for the stash (only for push)"),
    }),
    execute: async ({ action, message }) => {
      try {
        let cmd: string;
        switch (action) {
          case "push":
            cmd = message ? `git stash push -m "${message}"` : "git stash push";
            break;
          case "pop":
            cmd = "git stash pop";
            break;
          case "list":
            cmd = "git stash list";
            break;
        }

        const result = await exec.execute(cmd, cwd);
        if (result.exitCode !== 0) {
          return `Error: ${result.stderr || "git stash command failed"}`;
        }
        return result.stdout.trim() || result.stderr.trim() || "Done.";
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
