import type { IPipelineStep, NextFunction } from "#core/interfaces/IPipelineStep.js";
import type { IUserInterface } from "#core/interfaces/IUserInterface.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

export class HumanApprovalStep implements IPipelineStep {
  name = "HumanApproval";
  private ui: IUserInterface;

  constructor(ui: IUserInterface) {
    this.ui = ui;
  }

  async execute(context: AgentContext, next: NextFunction): Promise<void> {
    await next();

    if (context.pendingChanges.length > 0) {
      const approved = await this.ui.confirmChanges(context.pendingChanges);
      context.pendingChanges = approved;
    }
  }
}
