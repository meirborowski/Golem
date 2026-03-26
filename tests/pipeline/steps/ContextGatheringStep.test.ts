import { describe, it, expect } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { ContextGatheringStep } from "../../../src/pipeline/steps/ContextGatheringStep.js";
import { MemoryFileSystemAdapter } from "../../../src/adapters/fs/MemoryFileSystemAdapter.js";
import type { AgentContext } from "../../../src/core/entities/AgentContext.js";

function mockResult(text: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 20, text: undefined, reasoning: undefined },
    },
    warnings: [],
  };
}

function createModel(text = "Distilled.") {
  return new MockLanguageModelV3({ doGenerate: mockResult(text) });
}

function createContext(): AgentContext {
  return {
    messages: [{ role: "system", content: "You are Golem." }],
    currentRequest: "help me",
    workingDirectory: "/project",
    gatheredFiles: new Map(),
    pendingChanges: [],
    shouldContinue: true,
    metadata: {},
  };
}

describe("ContextGatheringStep", () => {
  it("reads project files into gatheredFiles", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/package.json": '{"name":"test"}',
      "/README.md": "# Hello",
    });
    const step = new ContextGatheringStep(fs, createModel());
    const ctx = createContext();

    await step.execute(ctx, async () => {});

    expect(ctx.gatheredFiles.size).toBe(2);
    expect(ctx.gatheredFiles.get("package.json")).toBe('{"name":"test"}');
    expect(ctx.gatheredFiles.get("README.md")).toBe("# Hello");
  });

  it("injects project context as system message", async () => {
    const fs = new MemoryFileSystemAdapter({ "/package.json": '{"name":"test"}' });
    const step = new ContextGatheringStep(fs, createModel());
    const ctx = createContext();

    await step.execute(ctx, async () => {});

    const systemMessages = ctx.messages.filter(m => m.role === "system");
    expect(systemMessages.length).toBe(2);
    expect(String(systemMessages[1].content)).toContain("Project context:");
  });

  it("only gathers once (skips if gatheredFiles not empty)", async () => {
    const fs = new MemoryFileSystemAdapter({ "/package.json": '{"name":"test"}' });
    const step = new ContextGatheringStep(fs, createModel());
    const ctx = createContext();
    ctx.gatheredFiles.set("already.txt", "data");

    const messagesBefore = ctx.messages.length;
    await step.execute(ctx, async () => {});

    expect(ctx.messages.length).toBe(messagesBefore);
    expect(ctx.gatheredFiles.size).toBe(1); // still just the one we set
  });

  it("calls next()", async () => {
    const fs = new MemoryFileSystemAdapter();
    const step = new ContextGatheringStep(fs, createModel());
    const ctx = createContext();
    let nextCalled = false;

    await step.execute(ctx, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});
