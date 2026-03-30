import type { AgentDefinition } from "../entities/AgentDefinition.js";

export interface IAgentRegistry {
  loadAll(): Promise<void>;
  getAll(): AgentDefinition[];
  get(name: string): AgentDefinition | undefined;
  getDefault(): AgentDefinition;
}
