import { tool } from "ai";
import { z } from "zod";
import type { IAgentRegistry } from "#core/interfaces/IAgentRegistry.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

export function createHandOffToAgentTool(
  registry: IAgentRegistry,
  context: AgentContext,
) {
  const agentDescriptions = registry
    .getAll()
    .map((a) => `${a.name}: ${a.description}`)
    .join("; ");

  return tool({
    description:
      `Hand off the conversation to a different specialized agent. ` +
      `Available agents: ${agentDescriptions}. ` +
      `Use this when the user's request is better suited for another agent. ` +
      `Conversation history carries over.`,
    inputSchema: z.object({
      agentName: z.string().describe("Name of the target agent"),
      reason: z.string().describe("Why this hand-off is appropriate"),
    }),
    execute: async ({ agentName, reason }) => {
      const agent = registry.get(agentName);
      if (!agent) {
        const available = registry
          .getAll()
          .map((a) => a.name)
          .join(", ");
        return `Unknown agent "${agentName}". Available: ${available}`;
      }

      // Signal handoff via structured context field
      context.pendingHandoff = agentName;

      return `Handing off to ${agentName}: ${reason}`;
    },
  });
}
