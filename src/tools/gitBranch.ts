import { tool } from "ai";
import { z } from "zod";
import type { IExecutionEnvironment } from "#core/interfaces/IExecutionEnvironment.js";

export function createGitBranchTool(exec: IExecutionEnvironment, cwd?: string) {
  return tool({
    description:
      "Manage git branches — list, create, or switch branches.",
    inputSchema: z.object({
      action: z.enum(["list", "create", "switch"]).describe("Action to perform"),
      name: z.string().optional().describe("Branch name (required for create/switch)"),
    }),
    execute: async ({ action, name }) => {
      try {
        let cmd: string;
        switch (action) {
          case "list":
            cmd = "git branch -a";
            break;
          case "create":
            if (!name) return "Error: Branch name is required for create.";
            cmd = `git checkout -b "${name}"`;
            break;
          case "switch":
            if (!name) return "Error: Branch name is required for switch.";
            cmd = `git checkout "${name}"`;
            break;
        }

        const result = await exec.execute(cmd, cwd);
        if (result.exitCode !== 0) {
          return `Error: ${result.stderr || "git branch command failed"}`;
        }
        return result.stdout.trim() || result.stderr.trim() || "Done.";
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
