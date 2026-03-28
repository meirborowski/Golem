import { tool } from "ai";
import { z } from "zod";

export function createThinkTool() {
  return tool({
    description:
      "Use this tool to think through complex problems step-by-step before acting. " +
      "Call this when you need to analyze a situation, plan an approach, weigh trade-offs, " +
      "or reason about code before making changes. The tool has no side effects.",
    inputSchema: z.object({
      thought: z.string().describe("Your reasoning, analysis, or plan"),
    }),
    execute: async ({ thought }) => thought,
  });
}
