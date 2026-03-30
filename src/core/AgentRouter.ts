import { generateText } from "ai";
import { z } from "zod";
import type { LanguageModel } from "ai";
import type { AgentDefinition } from "./entities/AgentDefinition.js";

const ROUTER_PROMPT = `You are an agent router. Given the user's message and a list of available agents, pick the single best agent to handle the request.

Available agents:
{AGENT_LIST}`;

export class AgentRouter {
  constructor(private model: LanguageModel) {}

  async selectAgent(
    userMessage: string,
    agents: AgentDefinition[],
    fallback: string,
  ): Promise<string> {
    const agentNames = agents.map((a) => a.name);
    const agentList = agents
      .map((a) => `- ${a.name}: ${a.description}`)
      .join("\n");

    try {
      const { experimental_output: output } = await generateText({
        model: this.model,
        messages: [
          {
            role: "system",
            content: ROUTER_PROMPT.replace("{AGENT_LIST}", agentList),
          },
          { role: "user", content: userMessage },
        ],
        experimental_output: z.object({
          agent: z.enum(agentNames as [string, ...string[]]).describe("The best agent to handle this request"),
        }),
      });

      return output?.agent ?? fallback;
    } catch {
      return fallback;
    }
  }
}
