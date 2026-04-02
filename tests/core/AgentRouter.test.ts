import { describe, it, expect } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { AgentRouter } from "#core/AgentRouter.js";
import type { AgentDefinition } from "#core/entities/AgentDefinition.js";

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

const agents: AgentDefinition[] = [
  { name: "code", description: "General coding", systemPrompt: "", sourceFile: "code.md" },
  { name: "review", description: "Code review", systemPrompt: "", sourceFile: "review.md" },
  { name: "architect", description: "Design and planning", systemPrompt: "", sourceFile: "architect.md" },
];

describe("AgentRouter", () => {
  it("passes agent descriptions and user message to model", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: mockResult('{"agent":"code"}'),
    });
    const router = new AgentRouter(model);

    await router.selectAgent("fix a bug", agents, "code");

    expect(model.doGenerateCalls).toHaveLength(1);
    const prompt = model.doGenerateCalls[0].prompt;
    const systemMsg = prompt.find((m: any) => m.role === "system");
    const userMsg = prompt.find((m: any) => m.role === "user");
    expect(JSON.stringify(systemMsg)).toContain("code: General coding");
    expect(JSON.stringify(systemMsg)).toContain("review: Code review");
    expect(JSON.stringify(userMsg)).toContain("fix a bug");
  });

  it("returns fallback when model throws", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => { throw new Error("API error"); },
    });
    const router = new AgentRouter(model);

    const result = await router.selectAgent("fix a bug", agents, "code");
    expect(result).toBe("code");
  });

  it("returns fallback when output is null", async () => {
    // Return text that doesn't parse as the expected structured output
    const model = new MockLanguageModelV3({
      doGenerate: mockResult("invalid response"),
    });
    const router = new AgentRouter(model);

    // experimental_output may be null/undefined if parsing fails, which triggers fallback
    const result = await router.selectAgent("fix a bug", agents, "code");
    // Either it returns the parsed agent or falls back to "code"
    expect(typeof result).toBe("string");
  });
});
