import { streamText, stepCountIs } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import type { IFileSystem } from "./interfaces/IFileSystem.js";
import type { IUserInterface } from "./interfaces/IUserInterface.js";
import type { IExecutionEnvironment } from "./interfaces/IExecutionEnvironment.js";
import type { AgentContext } from "./entities/AgentContext.js";
import { PipelineEngine } from "#pipeline/engine.js";
import { createTools } from "#tools/index.js";

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
  wrapTools?: (tools: ReturnType<typeof createTools>) => ReturnType<typeof createTools>;
}

export class Agent {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async run(): Promise<void> {
    const context = this.createContext();
    const rawTools = createTools(
      this.config.fs,
      this.config.exec,
      context,
      this.config.model,
      this.config.ui,
    );
    const tools = this.config.wrapTools ? this.config.wrapTools(rawTools) : rawTools;

    while (context.shouldContinue) {
      const userInput = await this.config.ui.prompt("You> ");

      if (userInput.toLowerCase() === "exit") {
        break;
      }

      context.currentRequest = userInput;
      context.messages.push({ role: "user", content: userInput });
      context.pendingChanges = [];

      await this.config.prePipeline.run(context);

      try {
        await this.generate(context, tools);
      } catch (e) {
        if (this.isContextLengthError(e)) {
          this.config.ui.displayError(
            "Context length exceeded. The conversation is too long for the model. Try a shorter request or start a new session.",
          );
          continue;
        }
        throw e;
      }

      await this.config.postPipeline.run(context);

      await this.applyChanges(context);
    }

    this.config.ui.display("Goodbye.");
  }

  private async generate(
    context: AgentContext,
    tools: ReturnType<typeof createTools>,
  ): Promise<void> {
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

      const usage = await result.totalUsage;
      context.tokenUsage = {
        lastInputTokens: usage.inputTokens ?? 0,
        lastOutputTokens: usage.outputTokens ?? 0,
        lastTotalTokens: usage.totalTokens ?? 0,
      };
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

  private isContextLengthError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes("context_length_exceeded") || msg.includes("context length");
    }
    return false;
  }

  private createContext(): AgentContext {
    const systemPrompt = this.config.systemPrompt ??
      "You are Golem, an expert coding agent. You can read files, write files, list directories, and execute shell commands. Always read relevant files before making changes. When you need clarification from the user, use the askUser tool for open-ended questions or askUserChoice to present a list of options — these let you pause, ask, and receive the answer before continuing. Never print questions as plain text.";

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
