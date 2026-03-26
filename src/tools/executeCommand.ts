import { tool } from "ai";
import { z } from "zod";
import type { IExecutionEnvironment } from "../core/interfaces/IExecutionEnvironment.js";

export function createExecuteCommandTool(exec: IExecutionEnvironment, cwd?: string) {
  return tool({
    description: "Run a shell command and return stdout/stderr",
    inputSchema: z.object({
      command: z.string().describe("Shell command to execute"),
    }),
    execute: async ({ command }) => {
      try {
        const result = await exec.execute(command, cwd);
        return `Exit code: ${result.exitCode}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`;
      } catch (e) {
        return `Error executing command: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
