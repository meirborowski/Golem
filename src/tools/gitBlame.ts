import { tool } from "ai";
import { z } from "zod";
import type { IExecutionEnvironment } from "#core/interfaces/IExecutionEnvironment.js";

const MAX_OUTPUT_LENGTH = 10000;

export function createGitBlameTool(exec: IExecutionEnvironment, cwd?: string) {
  return tool({
    description:
      "Show line-by-line git blame for a file. Shows who last modified each line and when. Useful for understanding code history and ownership.",
    inputSchema: z.object({
      path: z.string().describe("File path to blame"),
      startLine: z.number().optional().describe("Start line number for a specific range"),
      endLine: z.number().optional().describe("End line number for a specific range"),
    }),
    execute: async ({ path, startLine, endLine }) => {
      try {
        const args = ["git", "blame"];
        if (startLine != null && endLine != null) {
          args.push(`-L${startLine},${endLine}`);
        }
        args.push("--", path);

        const result = await exec.execute(args.join(" "), cwd);
        if (result.exitCode !== 0) {
          return `Error: ${result.stderr || "git blame failed"}`;
        }

        const output = result.stdout.trim();
        if (!output) {
          return `No blame output for ${path}.`;
        }

        if (output.length > MAX_OUTPUT_LENGTH) {
          return output.slice(0, MAX_OUTPUT_LENGTH) + `\n\n... truncated (${output.length} total chars). Use startLine/endLine to focus on a specific range.`;
        }
        return output;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
