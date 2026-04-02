import { describe, it, expect, vi } from "vitest";
import { createDelegateToAgentTool } from "#tools/delegateToAgent.js";
import type { IAgentRegistry } from "#core/interfaces/IAgentRegistry.js";
import type { ISubAgentRunner } from "#core/interfaces/ISubAgentRunner.js";
import type { AgentContext } from "#core/entities/AgentContext.js";
import type { AgentDefinition } from "#core/entities/AgentDefinition.js";

const codeAgent: AgentDefinition = {
  name: "code",
  description: "General coding",
  systemPrompt: "You are a coding agent.",
  sourceFile: "code.md",
};

const reviewAgent: AgentDefinition = {
  name: "review",
  description: "Code review",
  systemPrompt: "You review code.",
  sourceFile: "review.md",
};

function createRegistry(agents: AgentDefinition[]): IAgentRegistry {
  return {
    loadAll: async () => {},
    getAll: () => agents,
    get: (name) => agents.find((a) => a.name === name),
    getDefault: () => agents[0],
  };
}

function createContext(): AgentContext {
  return {
    messages: [],
    currentRequest: "test",
    workingDirectory: "/project",
    gatheredFiles: new Map(),
    pendingChanges: [],
    shouldContinue: true,
    metadata: {},
  };
}

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("delegateToAgent tool", () => {
  it("returns error with available names when agent not found", async () => {
    const registry = createRegistry([codeAgent, reviewAgent]);
    const runner: ISubAgentRunner = { runSubTask: vi.fn() };
    const ctx = createContext();
    const tool = createDelegateToAgentTool(registry, runner, ctx);

    const result = await exec(tool, { agentName: "nonexistent", task: "do stuff" });
    expect(result).toContain('Unknown agent "nonexistent"');
    expect(result).toContain("code");
    expect(result).toContain("review");
  });

  it("calls runner.runSubTask for isolated mode", async () => {
    const registry = createRegistry([codeAgent]);
    const runner: ISubAgentRunner = {
      runSubTask: vi.fn().mockResolvedValue({
        textOutput: "Done!",
        pendingChanges: [],
      }),
    };
    const ctx = createContext();
    const tool = createDelegateToAgentTool(registry, runner, ctx);

    await exec(tool, { agentName: "code", task: "fix bug", shareContext: false });
    expect(runner.runSubTask).toHaveBeenCalledWith("fix bug", codeAgent, undefined);
  });

  it("calls runner.runSubTask with parentContext for shared mode", async () => {
    const registry = createRegistry([codeAgent]);
    const runner: ISubAgentRunner = {
      runSubTask: vi.fn().mockResolvedValue({
        textOutput: "Done!",
        pendingChanges: [],
      }),
    };
    const ctx = createContext();
    const tool = createDelegateToAgentTool(registry, runner, ctx);

    await exec(tool, { agentName: "code", task: "fix bug", shareContext: true });
    expect(runner.runSubTask).toHaveBeenCalledWith("fix bug", codeAgent, ctx);
  });

  it("merges sub-agent pendingChanges into parent context", async () => {
    const registry = createRegistry([codeAgent]);
    const runner: ISubAgentRunner = {
      runSubTask: vi.fn().mockResolvedValue({
        textOutput: "Fixed it.",
        pendingChanges: [
          { filePath: "/src/a.ts", operation: "modify", newContent: "new", originalContent: "old" },
        ],
      }),
    };
    const ctx = createContext();
    const tool = createDelegateToAgentTool(registry, runner, ctx);

    await exec(tool, { agentName: "code", task: "fix bug" });
    expect(ctx.pendingChanges).toHaveLength(1);
    expect(ctx.pendingChanges[0].filePath).toBe("/src/a.ts");
  });

  it("returns formatted summary with text and changes", async () => {
    const registry = createRegistry([codeAgent]);
    const runner: ISubAgentRunner = {
      runSubTask: vi.fn().mockResolvedValue({
        textOutput: "Fixed the bug.",
        pendingChanges: [
          { filePath: "/src/a.ts", operation: "modify", newContent: "new", originalContent: "old" },
        ],
      }),
    };
    const ctx = createContext();
    const tool = createDelegateToAgentTool(registry, runner, ctx);

    const result = await exec(tool, { agentName: "code", task: "fix bug" });
    expect(result).toContain('Sub-agent "code" completed');
    expect(result).toContain("Fixed the bug.");
    expect(result).toContain("modify: /src/a.ts");
  });

  it("returns error on sub-agent failure", async () => {
    const registry = createRegistry([codeAgent]);
    const runner: ISubAgentRunner = {
      runSubTask: vi.fn().mockResolvedValue({
        textOutput: "",
        pendingChanges: [],
        error: "Context length exceeded",
      }),
    };
    const ctx = createContext();
    const tool = createDelegateToAgentTool(registry, runner, ctx);

    const result = await exec(tool, { agentName: "code", task: "fix bug" });
    expect(result).toContain('Sub-agent "code" failed');
    expect(result).toContain("Context length exceeded");
  });
});
