import type { AgentDefinition } from "../entities/AgentDefinition.js";
import type { AgentContext } from "../entities/AgentContext.js";
import type { SubAgentResult } from "../entities/SubAgentResult.js";

export interface ISubAgentRunner {
  runSubTask(
    input: string,
    agentDef: AgentDefinition,
    parentContext?: AgentContext,
  ): Promise<SubAgentResult>;
}
