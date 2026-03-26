import { describe, it, expect, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { ContextGatheringStep } from "./ContextGatheringStep.js";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
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

const next = vi.fn();

describe("ContextGatheringStep", () => {
  it("distills instruction files via LLM when present", async () => {
    const fs = new MemoryFileSystemAdapter({
      "GOLEM.md": "# Golem Rules\nAlways use tabs.",
      "CLAUDE.md": "# Claude Rules\nUse TypeScript.",
      "README.md": "# My Project\nA cool project.",
      "package.json": '{"name": "test"}',
    });
    const model = createMockModel("Distilled system prompt here.");
    const ui = createMockUI();
    const step = new ContextGatheringStep(fs, model, ui);
    const context = createContext();

    await step.execute(context, next);

    // LLM was called
    expect(model.doGenerateCalls).toHaveLength(1);

    // Distilled content injected as system message
    const systemMessages = context.messages.filter((m) => m.role === "system");
    expect(systemMessages).toHaveLength(2); // original + distilled
    expect(systemMessages[1].content).toContain("Distilled system prompt here.");

    // Raw files stored in gatheredFiles
    expect(context.gatheredFiles.size).toBe(4);
    expect(context.gatheredFiles.get("GOLEM.md")).toBe("# Golem Rules\nAlways use tabs.");

    // Progress spinner shown
    expect(ui.showProgress).toHaveBeenCalledWith("Gathering project context...");

    // next() called
    expect(next).toHaveBeenCalled();
  });

  it("works with only CLAUDE.md present", async () => {
    const fs = new MemoryFileSystemAdapter({
      "CLAUDE.md": "Use strict mode.",
    });
    const model = createMockModel("Distilled from CLAUDE.md.");
    const step = new ContextGatheringStep(fs, model);
    const context = createContext();

    await step.execute(context, next);

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(context.gatheredFiles.size).toBe(1);

    const systemMessages = context.messages.filter((m) => m.role === "system");
    expect(systemMessages[1].content).toContain("Distilled from CLAUDE.md.");
  });

  it("falls back to raw dump when no instruction files exist", async () => {
    const fs = new MemoryFileSystemAdapter({
      "package.json": '{"name": "test"}',
      "tsconfig.json": '{"compilerOptions": {}}',
    });
    const model = createMockModel("Should not be called.");
    const step = new ContextGatheringStep(fs, model);
    const context = createContext();

    await step.execute(context, next);

    // LLM NOT called since no instruction files
    expect(model.doGenerateCalls).toHaveLength(0);

    // Raw dump injected instead
    const systemMessages = context.messages.filter((m) => m.role === "system");
    expect(systemMessages[1].content).toContain("--- package.json ---");
    expect(context.gatheredFiles.size).toBe(2);
  });

  it("falls back to raw dump when LLM call fails", async () => {
    const fs = new MemoryFileSystemAdapter({
      "GOLEM.md": "# Rules",
      "package.json": '{"name": "test"}',
    });
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error("API error");
      },
    });
    const step = new ContextGatheringStep(fs, model);
    const context = createContext();

    await step.execute(context, next);

    // Should not throw, falls back to raw dump
    const systemMessages = context.messages.filter((m) => m.role === "system");
    expect(systemMessages[1].content).toContain("--- GOLEM.md ---");
    expect(next).toHaveBeenCalled();
  });

  it("skips when already gathered", async () => {
    const fs = new MemoryFileSystemAdapter({ "GOLEM.md": "rules" });
    const model = createMockModel("Distilled.");
    const step = new ContextGatheringStep(fs, model);
    const context = createContext({
      gatheredFiles: new Map([["GOLEM.md", "already gathered"]]),
    });

    await step.execute(context, next);

    // LLM NOT called, messages unchanged (only original system message)
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(context.messages).toHaveLength(1);
    expect(next).toHaveBeenCalled();
  });

  it("works without UI (no progress spinner)", async () => {
    const fs = new MemoryFileSystemAdapter({ "GOLEM.md": "rules" });
    const model = createMockModel("Distilled.");
    const step = new ContextGatheringStep(fs, model); // no ui
    const context = createContext();

    // Should not throw
    await step.execute(context, next);

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(next).toHaveBeenCalled();
  });

  it("includes priority labels in LLM payload", async () => {
    const fs = new MemoryFileSystemAdapter({
      "GOLEM.md": "golem rules",
      "README.md": "readme content",
    });
    const model = createMockModel("Distilled.");
    const step = new ContextGatheringStep(fs, model);
    const context = createContext();

    await step.execute(context, next);

    // Check that the LLM received priority-labeled content
    const call = model.doGenerateCalls[0];
    const messages = call.prompt;
    const userMessage = messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage).toBeDefined();

    // Extract full text from the user message content
    const content = userMessage!.content;
    const fullText = Array.isArray(content)
      ? content.filter((c) => c.type === "text").map((c) => "text" in c ? c.text : "").join("")
      : String(content);
    expect(fullText).toContain("[HIGHEST PRIORITY]");
    expect(fullText).toContain("[MEDIUM PRIORITY]");
    expect(fullText).toContain("golem rules");
    expect(fullText).toContain("readme content");
  });

  it("injects no system message when no files exist at all", async () => {
    const fs = new MemoryFileSystemAdapter({});
    const model = createMockModel("Should not be called.");
    const step = new ContextGatheringStep(fs, model);
    const context = createContext();

    await step.execute(context, next);

    // No files found, no system message added
    expect(context.messages).toHaveLength(1);
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(next).toHaveBeenCalled();
  });
});
