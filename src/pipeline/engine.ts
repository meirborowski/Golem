import type { IPipelineStep, NextFunction } from "#core/interfaces/IPipelineStep.js";
import type { IDebugLogger } from "#core/interfaces/IDebugLogger.js";
import type { AgentContext } from "#core/entities/AgentContext.js";
import { snapshotContext } from "#core/interfaces/IDebugLogger.js";

export class PipelineEngine {
  private steps: IPipelineStep[] = [];
  private debugLogger?: IDebugLogger;

  constructor(debugLogger?: IDebugLogger) {
    this.debugLogger = debugLogger;
  }

  register(step: IPipelineStep): void {
    this.steps.push(step);
  }

  async run(context: AgentContext): Promise<void> {
    let index = 0;
    const logger = this.debugLogger;

    const next: NextFunction = async () => {
      if (index < this.steps.length) {
        const step = this.steps[index++];

        if (logger?.isEnabled()) {
          logger.log("pipeline", "step-input", {
            step: step.name,
            context: snapshotContext(context),
          });
        }

        const startTime = logger?.isEnabled() ? Date.now() : 0;
        await step.execute(context, next);

        if (logger?.isEnabled()) {
          logger.log("pipeline", "step-output", {
            step: step.name,
            durationMs: Date.now() - startTime,
            context: snapshotContext(context),
          });
        }
      }
    };

    await next();
  }
}
