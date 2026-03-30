export interface AgentModelOverride {
  provider: string;
  model: string;
}

export interface AgentPipelineOverride {
  pre?: string[];
  post?: string[];
}

export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[];
  model?: AgentModelOverride;
  pipeline?: AgentPipelineOverride;
  maxSteps?: number;
  sourceFile: string;
}
