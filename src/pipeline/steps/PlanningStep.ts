import type {
  IPipelineStep,
  NextFunction,
} from "#core/interfaces/IPipelineStep.js";
import type { ISubAgentRunner } from "#core/interfaces/ISubAgentRunner.js";
import type { IAgentRegistry } from "#core/interfaces/IAgentRegistry.js";
import type { IUserInterface } from "#core/interfaces/IUserInterface.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

export class PlanningStep implements IPipelineStep {
  name = "Planning";
  private runner: ISubAgentRunner | null = null;

  constructor(
    private registry: IAgentRegistry,
    private ui: IUserInterface,
  ) {}

  /** Lazy setter to break circular dependency with Agent. */
  setRunner(runner: ISubAgentRunner): void {
    this.runner = runner;
  }

  async execute(context: AgentContext, next: NextFunction): Promise<void> {
    if (
      context.activeAgent === "architect" ||
      !this.runner ||
      !context.currentRequest?.trim()
    ) {
      return next();
    }

    const architect = this.registry.get("architect");
    if (!architect) return next();

    const stopProgress = this.ui.showProgress("Planning...");
    try {
      const result = await this.runner.runSubTask(
        `Analyze the codebase and produce a concise implementation plan for this task. Do NOT implement anything.\n\nTask: ${context.currentRequest}`,
        architect,
        context,
      );
      stopProgress();

      if (result.error) {
        this.ui.display(`[Planning skipped: ${result.error}]`);
        return next();
      }

      context.messages.push({
        role: "system",
        content: `Implementation plan from architect:\n\n${result.textOutput}`,
      });

      if (result.sessionTokenUsage) {
        context.sessionTokenUsage.totalInputTokens +=
          result.sessionTokenUsage.totalInputTokens;
        context.sessionTokenUsage.totalOutputTokens +=
          result.sessionTokenUsage.totalOutputTokens;
        context.sessionTokenUsage.totalTokens +=
          result.sessionTokenUsage.totalTokens;
      }
    } catch {
      stopProgress();
    }

    await next();
  }
}
