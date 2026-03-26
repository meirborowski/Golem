import type { IPipelineStep, NextFunction } from "../../core/interfaces/IPipelineStep.js";
import type { IDebugLogger } from "../../core/interfaces/IDebugLogger.js";
import { snapshotContext } from "../../core/interfaces/IDebugLogger.js";
import type { AgentContext } from "../../core/entities/AgentContext.js";

/**
 * Pipeline step that logs context snapshots before and after the
 * remaining pipeline executes. Register as the first step in both
 * pre- and post-pipelines to capture full input/output of each phase.
 *
 * Business logic (Agent, tools, other steps) stays unaware of debug mode.
 */
export class DebugLoggingStep implements IPipelineStep {
  name: string;

  constructor(
    private phase: string,
    private logger: IDebugLogger,
  ) {
    this.name = `DebugLogging:${phase}`;
  }

  async execute(context: AgentContext, next: NextFunction): Promise<void> {
    this.logger.log("agent", `${this.phase}-start`, {
      context: snapshotContext(context),
    });

    const start = Date.now();
    await next();

    this.logger.log("agent", `${this.phase}-end`, {
      durationMs: Date.now() - start,
      context: snapshotContext(context),
    });
  }
}
