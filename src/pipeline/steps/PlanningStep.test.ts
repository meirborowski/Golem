import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlanningStep } from "./PlanningStep.js";
import type { AgentContext } from "#core/entities/AgentContext.js";
import type { IAgentRegistry } from "#core/interfaces/IAgentRegistry.js";
import type { IUserInterface } from "#core/interfaces/IUserInterface.js";
import type { ISubAgentRunner } from "#core/interfaces/ISubAgentRunner.js";
import type { AgentDefinition } from "#core/entities/AgentDefinition.js";
import type { SubAgentResult } from "#core/entities/SubAgentResult.js";

function createContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    messages: [{ role: "system", content: "You are Golem." }],
    currentRequest: "add a login page",
    workingDirectory: "/",
    gatheredFiles: new Map(),
    pendingChanges: [],
    shouldContinue: true,
    metadata: {},
    sessionTokenUsage: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      turnCount: 0,
    },
    ...overrides,
  };
}

function createMockUI(): IUserInterface {
  const stopFn = vi.fn();
  return {
    prompt: vi.fn(),
    display: vi.fn(),
    displayStream: vi.fn(),
    displayStreamEnd: vi.fn(),
    confirmChanges: vi.fn(),
    displayError: vi.fn(),
    displayToolCall: vi.fn(),
    displayToolResult: vi.fn(),
    showProgress: vi.fn(() => stopFn),
    updateTokenUsage: vi.fn(),
  };
}

const architectDef: AgentDefinition = {
  name: "architect",
  description: "Planning agent",
  systemPrompt: "You are an architect.",
  tools: ["readFile", "think"],
  sourceFile: "src/agents/architect.md",
};

describe("PlanningStep", () => {
  let ui: IUserInterface;
  let registry: IAgentRegistry;
  let runner: ISubAgentRunner;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ui = createMockUI();
    registry = {
      get: vi.fn((name: string) =>
        name === "architect" ? architectDef : undefined,
      ),
      getAll: vi.fn(() => [architectDef]),
      getDefault: vi.fn(() => architectDef),
    };
    runner = {
      runSubTask: vi.fn<() => Promise<SubAgentResult>>(() =>
        Promise.resolve({
          textOutput: "Step 1: Read files\nStep 2: Implement",
          pendingChanges: [],
          sessionTokenUsage: {
            totalInputTokens: 100,
            totalOutputTokens: 50,
            totalTokens: 150,
            estimatedCost: 0,
            turnCount: 1,
          },
        }),
      ),
    };
    next = vi.fn();
  });

  it("skips when active agent is architect", async () => {
    const step = new PlanningStep(registry, ui);
    step.setRunner(runner);
    const context = createContext({ activeAgent: "architect" });

    await step.execute(context, next);

    expect(runner.runSubTask).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("skips when runner is not set", async () => {
    const step = new PlanningStep(registry, ui);
    const context = createContext({ activeAgent: "code" });

    await step.execute(context, next);

    expect(next).toHaveBeenCalled();
  });

  it("skips when architect agent not in registry", async () => {
    const emptyRegistry: IAgentRegistry = {
      get: vi.fn(() => undefined),
      getAll: vi.fn(() => []),
      getDefault: vi.fn(() => architectDef),
    };
    const step = new PlanningStep(emptyRegistry, ui);
    step.setRunner(runner);
    const context = createContext({ activeAgent: "code" });

    await step.execute(context, next);

    expect(runner.runSubTask).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("skips when currentRequest is empty", async () => {
    const step = new PlanningStep(registry, ui);
    step.setRunner(runner);
    const context = createContext({ activeAgent: "code", currentRequest: "" });

    await step.execute(context, next);

    expect(runner.runSubTask).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("delegates to architect and injects system message silently", async () => {
    const step = new PlanningStep(registry, ui);
    step.setRunner(runner);
    const context = createContext({ activeAgent: "code" });

    await step.execute(context, next);

    expect(runner.runSubTask).toHaveBeenCalledWith(
      expect.stringContaining("add a login page"),
      architectDef,
      context,
    );
    expect(ui.display).not.toHaveBeenCalled();
    expect(context.messages).toContainEqual({
      role: "system",
      content: expect.stringContaining("Step 1: Read files"),
    });
    expect(next).toHaveBeenCalled();
  });

  it("handles architect error gracefully", async () => {
    runner.runSubTask = vi.fn(() =>
      Promise.resolve({
        textOutput: "",
        pendingChanges: [],
        error: "API timeout",
      }),
    );
    const step = new PlanningStep(registry, ui);
    step.setRunner(runner);
    const context = createContext({ activeAgent: "code" });

    await step.execute(context, next);

    expect(ui.display).toHaveBeenCalledWith(
      expect.stringContaining("Planning skipped"),
    );
    expect(context.messages).toHaveLength(1); // only original system message
    expect(next).toHaveBeenCalled();
  });

  it("accumulates token usage from planning", async () => {
    const step = new PlanningStep(registry, ui);
    step.setRunner(runner);
    const context = createContext({ activeAgent: "code" });

    await step.execute(context, next);

    expect(context.sessionTokenUsage.totalInputTokens).toBe(100);
    expect(context.sessionTokenUsage.totalOutputTokens).toBe(50);
    expect(context.sessionTokenUsage.totalTokens).toBe(150);
  });

  it("shows and stops progress spinner", async () => {
    const step = new PlanningStep(registry, ui);
    step.setRunner(runner);
    const context = createContext({ activeAgent: "code" });

    await step.execute(context, next);

    expect(ui.showProgress).toHaveBeenCalledWith("Planning...");
    const stopFn = (ui.showProgress as ReturnType<typeof vi.fn>).mock
      .results[0].value;
    expect(stopFn).toHaveBeenCalled();
  });
});
