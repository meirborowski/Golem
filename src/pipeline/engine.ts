import type { IPipelineStep, NextFunction } from "../core/interfaces/IPipelineStep.js";
import type { AgentContext } from "../core/entities/AgentContext.js";

export class PipelineEngine {
  private steps: IPipelineStep[] = [];

  register(step: IPipelineStep): void {
    this.steps.push(step);
  }

  async run(context: AgentContext): Promise<void> {
    let index = 0;

    const next: NextFunction = async () => {
      if (index < this.steps.length) {
        const step = this.steps[index++];
        await step.execute(context, next);
      }
    };

    await next();
  }
}
