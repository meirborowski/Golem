import { describe, it, expect } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createReadFileTool } from "#tools/readFile.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

function createContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    messages: [],
    currentRequest: "test task",
    workingDirectory: "/project",
    gatheredFiles: new Map(),
    pendingChanges: [],
    shouldContinue: true,
    metadata: {},
    ...overrides,
  };
}

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

function createMockModel(text = "Summarized content.") {
  return new MockLanguageModelV3({ doGenerate: mockResult(text) });
}

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("readFile tool", () => {
  it("reads small file as-is without summarization", async () => {
    const fs = new MemoryFileSystemAdapter({ "/small.ts": "const x = 1;" });
    const model = createMockModel();
    const tool = createReadFileTool(fs, model, createContext());

    const result = await exec(tool, { path: "/small.ts" });
    expect(result).toBe("const x = 1;");
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("summarizes file exceeding 4000 chars via LLM", async () => {
    const content = "x".repeat(4001);
    const fs = new MemoryFileSystemAdapter({ "/big.ts": content });
    const model = createMockModel("key exports only");
    const tool = createReadFileTool(fs, model, createContext());

    const result = await exec(tool, { path: "/big.ts" });
    expect(result).toContain("[Summarized");
    expect(result).toContain("key exports only");
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("reads file at exactly 4000 chars without summarization", async () => {
    const content = "y".repeat(4000);
    const fs = new MemoryFileSystemAdapter({ "/exact.ts": content });
    const model = createMockModel();
    const tool = createReadFileTool(fs, model, createContext());

    const result = await exec(tool, { path: "/exact.ts" });
    expect(result).toBe(content);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("falls back to truncation when LLM fails", async () => {
    const content = "z".repeat(5000);
    const fs = new MemoryFileSystemAdapter({ "/big.ts": content });
    const model = new MockLanguageModelV3({
      doGenerate: async () => { throw new Error("API error"); },
    });
    const tool = createReadFileTool(fs, model, createContext());

    const result = await exec(tool, { path: "/big.ts" });
    expect(result).toContain("truncated");
    expect(result.length).toBeLessThan(content.length);
  });

  it("returns error for missing file", async () => {
    const fs = new MemoryFileSystemAdapter();
    const model = createMockModel();
    const tool = createReadFileTool(fs, model, createContext());

    const result = await exec(tool, { path: "/missing.ts" });
    expect(result).toContain("Error reading /missing.ts");
  });

  it("uses 'General exploration' when currentRequest is empty", async () => {
    const content = "a".repeat(5000);
    const fs = new MemoryFileSystemAdapter({ "/big.ts": content });
    const model = createMockModel("summary");
    const tool = createReadFileTool(fs, model, createContext({ currentRequest: "" }));

    await exec(tool, { path: "/big.ts" });
    expect(model.doGenerateCalls).toHaveLength(1);
    // The prompt should contain "General exploration" since currentRequest is empty
    const prompt = model.doGenerateCalls[0].prompt;
    const userMsg = prompt.find((m: any) => m.role === "user");
    expect(JSON.stringify(userMsg)).toContain("General exploration");
  });
});
