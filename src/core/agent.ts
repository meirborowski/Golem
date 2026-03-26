import { streamText, stepCountIs } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import type { IFileSystem } from "./interfaces/IFileSystem.js";
import type { IUserInterface } from "./interfaces/IUserInterface.js";
import type { IExecutionEnvironment } from "./interfaces/IExecutionEnvironment.js";
import type { AgentContext } from "./entities/AgentContext.js";
import { PipelineEngine } from "../pipeline/engine.js";
import { createTools } from "../tools/index.js";

export interface AgentConfig {
  model: LanguageModel;
  fs: IFileSystem;
  ui: IUserInterface;
  exec: IExecutionEnvironment;
  prePipeline: PipelineEngine;
  postPipeline: PipelineEngine;
  workingDirectory: string;
  systemPrompt?: string;
  maxSteps?: number;
}

export class Agent {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async run(): Promise<void> {
    const context = this.createContext();

    while (context.shouldContinue) {
      const userInput = await this.config.ui.prompt("You> ");

      if (userInput.toLowerCase() === "exit") {
        break;
      }

      context.currentRequest = userInput;
      context.messages.push({ role: "user", content: userInput });
      context.pendingChanges = [];

      await this.config.prePipeline.run(context);

      await this.generate(context);

      await this.config.postPipeline.run(context);

      await this.applyChanges(context);
    }

    this.config.ui.display("Goodbye.");
  }

  private async generate(context: AgentContext): Promise<void> {
    const tools = createTools(this.config.fs, this.config.exec, context);
    const stopProgress = this.config.ui.showProgress("Thinking...");

    try {
      const result = streamText({
        model: this.config.model,
        messages: context.messages,
        tools,
        stopWhen: stepCountIs(this.config.maxSteps ?? 10),
      });

      let progressStopped = false;
      let hasText = false;

      for await (const chunk of result.fullStream) {
        switch (chunk.type) {
          case "text-delta":
            if (!progressStopped) {
              stopProgress();
              progressStopped = true;
            }
            hasText = true;
            this.config.ui.displayStream(chunk.text);
            break;

          case "tool-call":
            if (!progressStopped) {
              stopProgress();
              progressStopped = true;
            }
            this.config.ui.displayToolCall(
              chunk.toolName,
              chunk.input as Record<string, unknown>,
            );
            break;

          case "tool-result":
            this.config.ui.displayToolResult(
              chunk.toolName,
              typeof chunk.output === "string"
                ? chunk.output
                : JSON.stringify(chunk.output),
            );
            break;
        }
      }
      if (!progressStopped) stopProgress();

      if (hasText) {
        this.config.ui.displayStreamEnd();
      }

      const response = await result.response;
      context.messages.push(...response.messages as ModelMessage[]);
    } catch (e) {
      stopProgress();
      throw e;
    }
  }

  private async applyChanges(context: AgentContext): Promise<void> {
    for (const change of context.pendingChanges) {
      switch (change.operation) {
        case "create":
        case "modify":
          if (change.newContent !== undefined) {
            await this.config.fs.writeFile(change.filePath, change.newContent);
          }
          break;
        case "delete":
          await this.config.fs.deleteFile(change.filePath);
          break;
      }
    }
    context.pendingChanges = [];
  }

  private createContext(): AgentContext {
    const systemPrompt = this.config.systemPrompt ??
      "You are Golem, an expert coding agent. You can read files, write files, list directories, and execute shell commands. Always read relevant files before making changes.";

    return {
      messages: [{ role: "system", content: systemPrompt }],
      currentRequest: "",
      workingDirectory: this.config.workingDirectory,
      gatheredFiles: new Map(),
      pendingChanges: [],
      shouldContinue: true,
      metadata: {},
    };
  }
}
