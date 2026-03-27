import { describe, it, expect, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import type { ModelMessage } from "ai";
import { ContextCompactionStep } from "#pipeline/steps/ContextCompactionStep.js";
import type { AgentContext } from "#core/entities/AgentContext.js";
import type { IUserInterface } from "#core/interfaces/IUserInterface.js";

function createContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    messages: [{ role: "system", content: "You are Golem." }],
    currentRequest: "",
    workingDirectory: "/",
    gatheredFiles: new Map(),
    pendingChanges: [],
    shouldContinue: true,
    metadata: {},
    ...overrides,
  };
}

function mockGenerateResult(text: string): LanguageModelV3GenerateResult {
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

function createMockModel(responseText: string) {
  return new MockLanguageModelV3({
    doGenerate: mockGenerateResult(responseText),
  });
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
  };
}

const defaultConfig = {
  maxContextTokens: 1000,
  compactionThreshold: 0.75,
  targetAfterCompaction: 0.50,
  protectedTurnCount: 2,
};

const next = vi.fn();

function buildConversation(turnCount: number): ModelMessage[] {
  const messages: ModelMessage[] = [
    { role: "system", content: "You are Golem." },
  ];
  for (let i = 0; i < turnCount; i++) {
    messages.push({ role: "user", content: `User message ${i}: ${"x".repeat(200)}` });
    messages.push({ role: "assistant", content: `Assistant response ${i}: ${"y".repeat(200)}` });
  }
  return messages;
}

describe("ContextCompactionStep", () => {
  it("does not compact when under threshold", async () => {
    const model = createMockModel("Summary.");
    const ui = createMockUI();
    const step = new ContextCompactionStep(model, ui, {
      ...defaultConfig,
      maxContextTokens: 1_000_000,
    });
    const context = createContext({
      messages: [
        { role: "system", content: "You are Golem." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ],
    });

    await step.execute(context, next);

    expect(model.doGenerateCalls).toHaveLength(0);
    expect(context.messages).toHaveLength(3);
    expect(ui.display).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("compacts via summarization when over threshold", async () => {
    const model = createMockModel("- User asked about files\n- Assistant read foo.ts");
    const ui = createMockUI();
    const step = new ContextCompactionStep(model, ui, {
      ...defaultConfig,
      maxContextTokens: 100,
      compactionThreshold: 0.1,
      targetAfterCompaction: 0.05,
      protectedTurnCount: 1,
    });
    const messages = buildConversation(5);
    const context = createContext({
      messages,
      tokenUsage: { lastInputTokens: 50, lastOutputTokens: 10, lastTotalTokens: 60 },
    });

    await step.execute(context, next);

    expect(model.doGenerateCalls).toHaveLength(1);
    const systemMessages = context.messages.filter((m) => m.role === "system");
    expect(systemMessages.some((m) =>
      typeof m.content === "string" && m.content.includes("Summary of earlier conversation"),
    )).toBe(true);
    expect(ui.display).toHaveBeenCalledWith(
      expect.stringContaining("Context compressed"),
    );
    expect(next).toHaveBeenCalled();
  });

  it("preserves system messages at the start", async () => {
    const model = createMockModel("Summary of middle.");
    const ui = createMockUI();
    const step = new ContextCompactionStep(model, ui, {
      ...defaultConfig,
      maxContextTokens: 100,
      compactionThreshold: 0.1,
      targetAfterCompaction: 0.05,
      protectedTurnCount: 1,
    });
    const context = createContext({
      messages: [
        { role: "system", content: "You are Golem." },
        { role: "system", content: "Project context: some rules" },
        { role: "user", content: "old message " + "x".repeat(200) },
        { role: "assistant", content: "old response " + "y".repeat(200) },
        { role: "user", content: "recent message" },
        { role: "assistant", content: "recent response" },
      ],
      tokenUsage: { lastInputTokens: 50, lastOutputTokens: 10, lastTotalTokens: 60 },
    });

    await step.execute(context, next);

    expect(context.messages[0]).toEqual({ role: "system", content: "You are Golem." });
    expect(context.messages[1]).toEqual({ role: "system", content: "Project context: some rules" });
  });

  it("preserves recent turns", async () => {
    const model = createMockModel("Summary.");
    const ui = createMockUI();
    const step = new ContextCompactionStep(model, ui, {
      ...defaultConfig,
      maxContextTokens: 100,
      compactionThreshold: 0.1,
      targetAfterCompaction: 0.05,
      protectedTurnCount: 2,
    });
    const messages = buildConversation(6);
    const context = createContext({
      messages,
      tokenUsage: { lastInputTokens: 50, lastOutputTokens: 10, lastTotalTokens: 60 },
    });

    await step.execute(context, next);

    // Last 2 user messages should be preserved
    const userMessages = context.messages.filter((m) => m.role === "user");
    const lastUser = userMessages[userMessages.length - 1];
    expect(typeof lastUser.content === "string" && lastUser.content).toContain("User message 5");
  });

  it("truncates large tool results", async () => {
    const model = createMockModel("Summary.");
    const ui = createMockUI();
    const step = new ContextCompactionStep(model, ui, {
      ...defaultConfig,
      maxContextTokens: 200,
      compactionThreshold: 0.1,
      targetAfterCompaction: 0.9,
      protectedTurnCount: 1,
    });
    const largeResult = "x".repeat(5000);
    const context = createContext({
      messages: [
        { role: "system", content: "You are Golem." },
        { role: "user", content: "Read file foo.ts" },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call1",
              toolName: "readFile",
              output: { type: "text", value: largeResult },
            },
          ],
        },
        { role: "assistant", content: "old response" },
        { role: "user", content: "recent" },
        { role: "assistant", content: "recent response" },
      ],
      tokenUsage: { lastInputTokens: 100, lastOutputTokens: 10, lastTotalTokens: 110 },
    });

    await step.execute(context, next);

    // The tool result should have been truncated
    const toolMsg = context.messages.find((m) => m.role === "tool");
    if (toolMsg && Array.isArray(toolMsg.content)) {
      const part = toolMsg.content[0];
      if (part.type === "tool-result" && part.output.type === "text") {
        expect(part.output.value).toContain("[Truncated tool result");
        expect(part.output.value.length).toBeLessThan(largeResult.length);
      }
    }
    expect(next).toHaveBeenCalled();
  });

  it("uses heuristic estimation when no token usage data", async () => {
    const model = createMockModel("Summary.");
    const ui = createMockUI();
    const step = new ContextCompactionStep(model, ui, {
      ...defaultConfig,
      maxContextTokens: 50,
      compactionThreshold: 0.1,
      protectedTurnCount: 1,
    });
    const messages = buildConversation(3);
    const context = createContext({ messages });

    await step.execute(context, next);

    // Should still attempt compaction via heuristic
    expect(model.doGenerateCalls.length).toBeGreaterThanOrEqual(1);
    expect(next).toHaveBeenCalled();
  });

  it("falls back gracefully when LLM summarization fails", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error("API error");
      },
    });
    const ui = createMockUI();
    const step = new ContextCompactionStep(model, ui, {
      ...defaultConfig,
      maxContextTokens: 100,
      compactionThreshold: 0.1,
      targetAfterCompaction: 0.05,
      protectedTurnCount: 1,
    });
    const messages = buildConversation(5);
    const context = createContext({
      messages,
      tokenUsage: { lastInputTokens: 50, lastOutputTokens: 10, lastTotalTokens: 60 },
    });

    await step.execute(context, next);

    // Should not throw, and should still compact with truncated fallback
    const summaryMsg = context.messages.find(
      (m) => m.role === "system" && typeof m.content === "string" && m.content.includes("Summary of earlier conversation"),
    );
    expect(summaryMsg).toBeDefined();
    expect(typeof summaryMsg!.content === "string" && summaryMsg!.content).toContain("[Summary truncated due to error]");
    expect(next).toHaveBeenCalled();
  });

  it("does nothing when all messages are protected", async () => {
    const model = createMockModel("Summary.");
    const ui = createMockUI();
    const step = new ContextCompactionStep(model, ui, {
      ...defaultConfig,
      maxContextTokens: 100,
      compactionThreshold: 0.1,
      protectedTurnCount: 10,
    });
    const context = createContext({
      messages: [
        { role: "system", content: "You are Golem." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ],
      tokenUsage: { lastInputTokens: 50, lastOutputTokens: 10, lastTotalTokens: 60 },
    });

    await step.execute(context, next);

    // All messages are protected (1 system + 1 turn < protectedTurnCount of 10)
    // so no compaction should happen even though over threshold
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(context.messages).toHaveLength(3);
    expect(next).toHaveBeenCalled();
  });
});
