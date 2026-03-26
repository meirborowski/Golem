import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { IPipelineStep, NextFunction } from "#core/interfaces/IPipelineStep.js";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";
import type { IUserInterface } from "#core/interfaces/IUserInterface.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

const INSTRUCTION_FILES = [
  { path: "GOLEM.md", priority: "HIGHEST", label: "Project-specific instructions (GOLEM.md)" },
  { path: "CLAUDE.md", priority: "HIGH", label: "AI assistant instructions (CLAUDE.md)" },
  { path: "README.md", priority: "MEDIUM", label: "Project documentation (README.md)" },
] as const;

const SUPPLEMENTARY_FILES = ["package.json", "tsconfig.json"];

const DISTILLATION_PROMPT = `You are a context preparation assistant. Your job is to read project files and produce a focused system prompt for a coding agent called Golem.

You will receive the raw contents of project files. Some are instruction files (with priority levels), and some are supplementary config files.

Your output must be a single system prompt that:
1. Prioritizes instructions from higher-priority files. GOLEM.md has the highest priority, then CLAUDE.md, then README.md. If they conflict, higher priority wins.
2. Extracts and preserves ALL concrete rules, constraints, conventions, and requirements from instruction files. Do not drop specific instructions.
3. Summarizes supplementary files (package.json, tsconfig.json) into brief factual context: project name, key dependencies, TypeScript configuration highlights.
4. Organizes the output into clear sections: Project Identity, Key Rules & Constraints, Tech Stack & Dependencies, Conventions.
5. Is concise but complete — aim for the essential information a coding agent needs, not a verbose restatement.
6. Uses direct, imperative language suitable as a system prompt.

Do NOT add instructions that are not present in the source files. Only distill what is provided.`;

export class ContextGatheringStep implements IPipelineStep {
  name = "ContextGathering";

  constructor(
    private fs: IFileSystem,
    private model: LanguageModel,
    private ui?: IUserInterface,
  ) {}

  async execute(context: AgentContext, next: NextFunction): Promise<void> {
    if (context.gatheredFiles.size > 0) {
      await next();
      return;
    }

    const stopProgress = this.ui?.showProgress("Gathering project context...");

    try {
      const instructionContents = await this.readFiles(
        INSTRUCTION_FILES.map((f) => f.path),
      );
      const supplementaryContents = await this.readFiles(SUPPLEMENTARY_FILES);

      // Store all raw content in gatheredFiles
      for (const [path, content] of [...instructionContents, ...supplementaryContents]) {
        context.gatheredFiles.set(path, content);
      }

      const hasInstructions = INSTRUCTION_FILES.some((f) =>
        instructionContents.has(f.path),
      );

      let contextMessage: string;

      if (hasInstructions) {
        contextMessage = await this.distill(instructionContents, supplementaryContents);
      } else {
        contextMessage = this.rawDump(context.gatheredFiles);
      }

      if (contextMessage) {
        context.messages.push({
          role: "system",
          content: `Project context:\n\n${contextMessage}`,
        });
      }
    } finally {
      stopProgress?.();
    }

    await next();
  }

  private async readFiles(paths: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const path of paths) {
      try {
        if (await this.fs.exists(path)) {
          result.set(path, await this.fs.readFile(path));
        }
      } catch {
        // Skip files that can't be read
      }
    }
    return result;
  }

  private async distill(
    instructions: Map<string, string>,
    supplementary: Map<string, string>,
  ): Promise<string> {
    const userContent = this.buildDistillationPayload(instructions, supplementary);

    try {
      const { text } = await generateText({
        model: this.model,
        messages: [
          { role: "system", content: DISTILLATION_PROMPT },
          { role: "user", content: userContent },
        ],
      });
      return text;
    } catch {
      // Fallback to raw dump if LLM call fails
      const all = new Map([...instructions, ...supplementary]);
      return this.rawDump(all);
    }
  }

  private buildDistillationPayload(
    instructions: Map<string, string>,
    supplementary: Map<string, string>,
  ): string {
    const sections: string[] = ["## Instruction Files (in priority order)\n"];

    for (const file of INSTRUCTION_FILES) {
      const content = instructions.get(file.path);
      sections.push(
        `### ${file.path} [${file.priority} PRIORITY]\n${content ?? "Not found"}\n`,
      );
    }

    sections.push("## Supplementary Files\n");

    for (const path of SUPPLEMENTARY_FILES) {
      const content = supplementary.get(path);
      sections.push(`### ${path}\n${content ?? "Not found"}\n`);
    }

    return sections.join("\n");
  }

  private rawDump(files: Map<string, string>): string {
    return Array.from(files.entries())
      .map(([path, content]) => `--- ${path} ---\n${content}`)
      .join("\n\n");
  }
}
