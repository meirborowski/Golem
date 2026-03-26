import type { IPipelineStep, NextFunction } from "../../core/interfaces/IPipelineStep.js";
import type { IFileSystem } from "../../core/interfaces/IFileSystem.js";
import type { AgentContext } from "../../core/entities/AgentContext.js";

const PROJECT_FILES = ["package.json", "tsconfig.json", "README.md", "CLAUDE.md"];

export class ContextGatheringStep implements IPipelineStep {
  name = "ContextGathering";
  private fs: IFileSystem;

  constructor(fs: IFileSystem) {
    this.fs = fs;
  }

  async execute(context: AgentContext, next: NextFunction): Promise<void> {
    // Only gather on first request (when no files gathered yet)
    if (context.gatheredFiles.size === 0) {
      for (const file of PROJECT_FILES) {
        try {
          if (await this.fs.exists(file)) {
            const content = await this.fs.readFile(file);
            context.gatheredFiles.set(file, content);
          }
        } catch {
          // Skip files that can't be read
        }
      }

      // Inject project context as a system message
      if (context.gatheredFiles.size > 0) {
        const summary = Array.from(context.gatheredFiles.entries())
          .map(([path, content]) => `--- ${path} ---\n${content}`)
          .join("\n\n");

        context.messages.push({
          role: "system",
          content: `Project context:\n\n${summary}`,
        });
      }
    }

    await next();
  }
}
