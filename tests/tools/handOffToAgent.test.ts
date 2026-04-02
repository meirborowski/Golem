import { describe, it, expect } from "vitest";
import { createHandOffToAgentTool } from "#tools/handOffToAgent.js";
import type { IAgentRegistry } from "#core/interfaces/IAgentRegistry.js";
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

describe("handOffToAgent tool", () => {
  it("sets context.pendingHandoff to the agent name", async () => {
    const registry = createRegistry([codeAgent, reviewAgent]);
    const ctx = createContext();
    const tool = createHandOffToAgentTool(registry, ctx);

    await exec(tool, { agentName: "review", reason: "User wants code review" });
    expect(ctx.pendingHandoff).toBe("review");
  });

  it("returns formatted handoff message", async () => {
    const registry = createRegistry([codeAgent, reviewAgent]);
    const ctx = createContext();
    const tool = createHandOffToAgentTool(registry, ctx);

    const result = await exec(tool, { agentName: "review", reason: "User wants code review" });
    expect(result).toContain("Handing off to review");
    expect(result).toContain("User wants code review");
  });

  it("returns error with available names when agent not found", async () => {
    const registry = createRegistry([codeAgent, reviewAgent]);
    const ctx = createContext();
    const tool = createHandOffToAgentTool(registry, ctx);

    const result = await exec(tool, { agentName: "nonexistent", reason: "test" });
    expect(result).toContain('Unknown agent "nonexistent"');
    expect(result).toContain("code");
    expect(result).toContain("review");
    expect(ctx.pendingHandoff).toBeUndefined();
  });
});
