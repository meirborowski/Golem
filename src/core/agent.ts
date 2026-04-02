import { streamText, stepCountIs } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import type { IFileSystem } from "./interfaces/IFileSystem.js";
import type { IUserInterface } from "./interfaces/IUserInterface.js";
import type { IExecutionEnvironment } from "./interfaces/IExecutionEnvironment.js";
import type { IAgentRegistry } from "./interfaces/IAgentRegistry.js";
import type { ISubAgentRunner } from "./interfaces/ISubAgentRunner.js";
import type { IPipelineStep } from "./interfaces/IPipelineStep.js";
import type { AgentContext } from "./entities/AgentContext.js";
import type { AgentDefinition } from "./entities/AgentDefinition.js";
import type { SubAgentResult } from "./entities/SubAgentResult.js";
import { PipelineEngine } from "#pipeline/engine.js";
import { createTools } from "#tools/index.js";
import { createHandOffToAgentTool } from "#tools/handOffToAgent.js";
import { createDelegateToAgentTool } from "#tools/delegateToAgent.js";
import { AgentRouter } from "./AgentRouter.js";
import { HeadlessUI } from "./HeadlessUI.js";
import { lookupPricing, calculateCost } from "./pricing.js";

export interface AgentConfig {
  model: LanguageModel;
  provider: string;
  modelName: string;
  fs: IFileSystem;
  ui: IUserInterface;
  exec: IExecutionEnvironment;
  prePipeline: PipelineEngine;
  postPipeline: PipelineEngine;
  workingDirectory: string;
  systemPrompt?: string;
  maxSteps?: number;
  wrapTools?: (tools: ReturnType<typeof createTools>) => ReturnType<typeof createTools>;
  agentRegistry?: IAgentRegistry;
  pipelineStepRegistry?: Map<string, IPipelineStep>;
  createModelFromOverride?: (provider: string, model: string) => LanguageModel;
}

export class Agent implements ISubAgentRunner {
  private config: AgentConfig;
  private activeModel: LanguageModel;
  private activeToolWhitelist: string[] | null = null;
  private activeMaxSteps: number | undefined;
  private activePrePipeline: PipelineEngine;
  private activePostPipeline: PipelineEngine;
  private router: AgentRouter | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.activeModel = config.model;
    this.activeMaxSteps = config.maxSteps;
    this.activePrePipeline = config.prePipeline;
    this.activePostPipeline = config.postPipeline;

    if (config.agentRegistry) {
      this.router = new AgentRouter(config.model);
    }
  }

  async run(): Promise<void> {
    const context = this.createContext();

    // If we have an agent registry, auto-configure with the default agent
    if (this.config.agentRegistry) {
      const defaultAgent = this.config.agentRegistry.getDefault();
      this.reconfigure(defaultAgent, context);
    }

    while (context.shouldContinue) {
      const userInput = await this.config.ui.prompt("You> ");

      if (userInput.toLowerCase() === "exit") {
        break;
      }

      // Handle /agents listing
      if (userInput.trim() === "/agents") {
        this.displayAgentList();
        continue;
      }

      // Resolve which agent to use
      const { agentName, cleanedInput } = await this.resolveAgent(
        userInput,
        context,
      );

      // Reconfigure if agent changed
      if (agentName && agentName !== context.activeAgent) {
        const agentDef = this.config.agentRegistry?.get(agentName);
        if (agentDef) {
          this.reconfigure(agentDef, context);
          this.config.ui.display(`[Switched to ${agentDef.name} agent]`);
        }
      }

      context.currentRequest = cleanedInput;
      context.messages.push({ role: "user", content: cleanedInput });
      context.pendingChanges = [];

      // Build tools for current agent configuration
      const tools = this.buildTools(context);

      await this.activePrePipeline.run(context);

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

      // Handle hand-off if triggered during generation
      if (context.pendingHandoff) {
        const handoffAgent = this.config.agentRegistry?.get(
          context.pendingHandoff,
        );
        if (handoffAgent) {
          this.reconfigure(handoffAgent, context);
          this.config.ui.display(
            `[Handed off to ${handoffAgent.name} agent]`,
          );
        }
        context.pendingHandoff = undefined;
      }

      await this.activePostPipeline.run(context);

      await this.applyChanges(context);
    }

    this.config.ui.display("Goodbye.");
  }

  private buildTools(context: AgentContext): ReturnType<typeof createTools> {
    const rawTools = createTools(
      this.config.fs,
      this.config.exec,
      context,
      this.activeModel,
      this.config.ui,
    );

    // Inject handOffToAgent and delegateToAgent if registry is available
    if (this.config.agentRegistry) {
      (rawTools as Record<string, unknown>).handOffToAgent =
        createHandOffToAgentTool(this.config.agentRegistry, context);
      (rawTools as Record<string, unknown>).delegateToAgent =
        createDelegateToAgentTool(this.config.agentRegistry, this, context);
    }

    // Apply tool whitelist
    let tools = rawTools;
    if (this.activeToolWhitelist) {
      const allowed = new Set([
        ...this.activeToolWhitelist,
        "handOffToAgent",
        "delegateToAgent",
        "think",
      ]);
      const filtered: Record<string, unknown> = {};
      for (const [name, def] of Object.entries(rawTools)) {
        if (allowed.has(name)) filtered[name] = def;
      }
      tools = filtered as typeof rawTools;
    }

    // Apply debug wrapping
    if (this.config.wrapTools) {
      tools = this.config.wrapTools(tools);
    }

    return tools;
  }

  private async resolveAgent(
    userInput: string,
    context: AgentContext,
  ): Promise<{ agentName: string | null; cleanedInput: string }> {
    if (!this.config.agentRegistry) {
      return { agentName: null, cleanedInput: userInput };
    }

    // Check for explicit /command override
    const commandMatch = userInput.match(/^\/(\w+)\s*([\s\S]*)$/);
    if (commandMatch) {
      const name = commandMatch[1].toLowerCase();
      const agent = this.config.agentRegistry.get(name);
      if (agent) {
        const input = commandMatch[2].trim() || userInput;
        return { agentName: agent.name, cleanedInput: input };
      }
    }

    // Auto-select via router if we have multiple agents
    const agents = this.config.agentRegistry.getAll();
    if (this.router && agents.length > 1) {
      const defaultName = this.config.agentRegistry.getDefault().name;
      const selected = await this.router.selectAgent(
        userInput,
        agents,
        defaultName,
      );
      return { agentName: selected, cleanedInput: userInput };
    }

    return {
      agentName: context.activeAgent ?? null,
      cleanedInput: userInput,
    };
  }

  private reconfigure(agentDef: AgentDefinition, context: AgentContext): void {
    context.activeAgent = agentDef.name;

    // Update system prompt (replace first system message)
    const systemIdx = context.messages.findIndex((m) => m.role === "system");
    if (systemIdx >= 0) {
      context.messages[systemIdx] = {
        role: "system",
        content: agentDef.systemPrompt,
      };
    }

    // Tool whitelist
    this.activeToolWhitelist = agentDef.tools ?? null;

    // Model override
    if (agentDef.model && this.config.createModelFromOverride) {
      this.activeModel = this.config.createModelFromOverride(
        agentDef.model.provider,
        agentDef.model.model,
      );
    } else {
      this.activeModel = this.config.model;
    }

    // Max steps override
    this.activeMaxSteps = agentDef.maxSteps ?? this.config.maxSteps;

    // Pipeline override
    if (agentDef.pipeline && this.config.pipelineStepRegistry) {
      if (agentDef.pipeline.pre) {
        this.activePrePipeline = this.buildPipeline(agentDef.pipeline.pre);
      } else {
        this.activePrePipeline = this.config.prePipeline;
      }
      if (agentDef.pipeline.post) {
        this.activePostPipeline = this.buildPipeline(agentDef.pipeline.post);
      } else {
        this.activePostPipeline = this.config.postPipeline;
      }
    } else {
      this.activePrePipeline = this.config.prePipeline;
      this.activePostPipeline = this.config.postPipeline;
    }
  }

  private buildPipeline(stepNames: string[]): PipelineEngine {
    const engine = new PipelineEngine();
    for (const name of stepNames) {
      const step = this.config.pipelineStepRegistry?.get(name);
      if (step) {
        engine.register(step);
      }
    }
    return engine;
  }

  private displayAgentList(): void {
    if (!this.config.agentRegistry) {
      this.config.ui.display("No agent registry configured.");
      return;
    }
    const agents = this.config.agentRegistry.getAll();
    const lines = agents.map(
      (a) => `  /${a.name} — ${a.description}`,
    );
    this.config.ui.display("Available agents:\n" + lines.join("\n"));
  }

  private async generate(
    context: AgentContext,
    tools: ReturnType<typeof createTools>,
    overrides?: { model?: LanguageModel; maxSteps?: number; ui?: IUserInterface },
  ): Promise<void> {
    const ui = overrides?.ui ?? this.config.ui;
    const model = overrides?.model ?? this.activeModel;
    const maxSteps = overrides?.maxSteps ?? this.activeMaxSteps ?? 10;
    const stopProgress = ui.showProgress("Thinking...");

    try {
      const result = streamText({
        model,
        messages: context.messages,
        tools,
        stopWhen: stepCountIs(maxSteps),
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
            ui.displayStream(chunk.text);
            break;

          case "tool-call":
            if (!progressStopped) {
              stopProgress();
              progressStopped = true;
            }
            ui.displayToolCall(
              chunk.toolName,
              chunk.input as Record<string, unknown>,
            );
            break;

          case "tool-result":
            ui.displayToolResult(
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
        ui.displayStreamEnd();
      }

      const response = await result.response;
      context.messages.push(...(response.messages as ModelMessage[]));

      const usage = await result.totalUsage;
      const inputTokens = usage.inputTokens ?? 0;
      const outputTokens = usage.outputTokens ?? 0;
      context.tokenUsage = {
        lastInputTokens: inputTokens,
        lastOutputTokens: outputTokens,
        lastTotalTokens: inputTokens + outputTokens,
      };

      // Accumulate session totals
      const session = context.sessionTokenUsage;
      session.totalInputTokens += inputTokens;
      session.totalOutputTokens += outputTokens;
      session.totalTokens += inputTokens + outputTokens;
      session.turnCount += 1;

      const pricing = lookupPricing(this.config.provider, this.config.modelName);
      if (pricing) {
        session.estimatedCost = calculateCost(session.totalInputTokens, session.totalOutputTokens, pricing);
      }

      ui.updateTokenUsage(session);
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
      return (
        msg.includes("context_length_exceeded") ||
        msg.includes("context length")
      );
    }
    return false;
  }

  async runSubTask(
    input: string,
    agentDef: AgentDefinition,
    parentContext?: AgentContext,
  ): Promise<SubAgentResult> {
    const headlessUI = new HeadlessUI();

    // Build sub-agent context
    let subContext: AgentContext;
    if (parentContext) {
      // Shared mode: copy parent's messages, replace system prompt
      const msgs: ModelMessage[] = [...parentContext.messages];
      const sysIdx = msgs.findIndex((m) => m.role === "system");
      if (sysIdx >= 0) {
        msgs[sysIdx] = { role: "system", content: agentDef.systemPrompt };
      }
      msgs.push({ role: "user", content: input });

      subContext = {
        messages: msgs,
        currentRequest: input,
        workingDirectory: parentContext.workingDirectory,
        gatheredFiles: new Map(parentContext.gatheredFiles),
        pendingChanges: [],
        shouldContinue: true,
        metadata: { ...parentContext.metadata },
        sessionTokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, estimatedCost: 0, turnCount: 0 },
        activeAgent: agentDef.name,
      };
    } else {
      // Isolated mode: fresh context
      subContext = {
        messages: [
          { role: "system", content: agentDef.systemPrompt },
          { role: "user", content: input },
        ],
        currentRequest: input,
        workingDirectory: this.config.workingDirectory,
        gatheredFiles: new Map(),
        pendingChanges: [],
        shouldContinue: true,
        metadata: {},
        sessionTokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, estimatedCost: 0, turnCount: 0 },
        activeAgent: agentDef.name,
      };
    }

    // Resolve model for sub-agent: agent def override > parent's active model
    const subModel =
      agentDef.model && this.config.createModelFromOverride
        ? this.config.createModelFromOverride(
            agentDef.model.provider,
            agentDef.model.model,
          )
        : this.activeModel;

    // Build tools: use agent def's whitelist, exclude interactive and delegation tools
    const rawTools = createTools(
      this.config.fs,
      this.config.exec,
      subContext,
      subModel,
      headlessUI,
    );

    let tools: ReturnType<typeof createTools>;
    if (agentDef.tools) {
      const allowed = new Set([...agentDef.tools, "think"]);
      allowed.delete("askUser");
      allowed.delete("askUserChoice");
      const filtered: Record<string, unknown> = {};
      for (const [name, def] of Object.entries(rawTools)) {
        if (allowed.has(name)) filtered[name] = def;
      }
      tools = filtered as typeof rawTools;
    } else {
      // All tools minus interactive ones
      const { askUser, askUserChoice, ...rest } = rawTools;
      tools = rest as typeof rawTools;
    }

    const subMaxSteps = agentDef.maxSteps ?? this.config.maxSteps ?? 10;

    try {
      await this.generate(subContext, tools, {
        model: subModel,
        maxSteps: subMaxSteps,
        ui: headlessUI,
      });

      // Never apply changes directly — always return them so they flow
      // through the parent's HumanApprovalStep pipeline.
      return {
        textOutput: headlessUI.getTextOutput(),
        pendingChanges: subContext.pendingChanges,
        tokenUsage: subContext.tokenUsage,
        sessionTokenUsage: subContext.sessionTokenUsage,
      };
    } catch (e) {
      return {
        textOutput: headlessUI.getTextOutput(),
        pendingChanges: [],
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private createContext(): AgentContext {
    const systemPrompt =
      this.config.systemPrompt ??
      "You are Golem, an expert coding agent. You can read files, write files, list directories, and execute shell commands. Always read relevant files before making changes. When you need clarification from the user, use the askUser tool for open-ended questions or askUserChoice to present a list of options — these let you pause, ask, and receive the answer before continuing. Never print questions as plain text.";

    return {
      messages: [{ role: "system", content: systemPrompt }],
      currentRequest: "",
      workingDirectory: this.config.workingDirectory,
      gatheredFiles: new Map(),
      pendingChanges: [],
      shouldContinue: true,
      metadata: {},
      sessionTokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, estimatedCost: 0, turnCount: 0 },
    };
  }
}
