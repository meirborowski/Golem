import { tool } from "ai";
import { z } from "zod";
import type { IAgentRegistry } from "#core/interfaces/IAgentRegistry.js";
import type { ISubAgentRunner } from "#core/interfaces/ISubAgentRunner.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

export function createDelegateToAgentTool(
  registry: IAgentRegistry,
  runner: ISubAgentRunner,
  parentContext: AgentContext,
) {
  const agentDescriptions = registry
    .getAll()
    .map((a) => `${a.name}: ${a.description}`)
    .join("; ");

  return tool({
    description:
      `Delegate a subtask to a specialized sub-agent. The sub-agent runs to completion and returns its result. ` +
      `You (the parent agent) continue afterward. ` +
      `Available agents: ${agentDescriptions}. ` +
      `Use shareContext=true to give the sub-agent your conversation history, or false for a clean slate.`,
    inputSchema: z.object({
      agentName: z.string().describe("Name of the agent to delegate to"),
      task: z.string().describe("Clear description of the subtask to perform"),
      shareContext: z
        .boolean()
        .default(false)
        .describe(
          "true = sub-agent inherits conversation history and file state; false = isolated fresh context",
        ),
    }),
    execute: async ({ agentName, task, shareContext }) => {
      const agentDef = registry.get(agentName);
      if (!agentDef) {
        const available = registry
          .getAll()
          .map((a) => a.name)
          .join(", ");
        return `Unknown agent "${agentName}". Available: ${available}`;
      }

      const result = await runner.runSubTask(
        task,
        agentDef,
        shareContext ? parentContext : undefined,
      );

      if (result.error) {
        return `Sub-agent "${agentName}" failed: ${result.error}`;
      }

      // Always merge pending changes into parent context so they flow
      // through the parent's HumanApprovalStep pipeline.
      if (result.pendingChanges.length > 0) {
        parentContext.pendingChanges.push(...result.pendingChanges);
      }

      // Build summary
      const parts: string[] = [];
      parts.push(`Sub-agent "${agentName}" completed.`);

      if (result.textOutput) {
        parts.push(`\nResponse:\n${result.textOutput}`);
      }

      if (result.pendingChanges.length > 0) {
        const changeList = result.pendingChanges
          .map((c) => `  - ${c.operation}: ${c.filePath}`)
          .join("\n");
        parts.push(`\nFile changes staged (pending approval):\n${changeList}`);
      }

      return parts.join("");
    },
  });
}
