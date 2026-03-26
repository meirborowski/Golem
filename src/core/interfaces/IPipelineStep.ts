import type { AgentContext } from "../entities/AgentContext.js";

export type NextFunction = () => Promise<void>;

export interface IPipelineStep {
  name: string;
  execute(context: AgentContext, next: NextFunction): Promise<void>;
}
