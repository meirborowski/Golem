import { describe, it, expect } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createReadMultipleFilesTool } from "#tools/readMultipleFiles.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

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

const mockModel = new MockLanguageModelV3({
  doGenerate: {
    content: [{ type: "text", text: "summary" }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 20, text: undefined, reasoning: undefined },
    },
    warnings: [],
  },
});

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("readMultipleFiles tool", () => {
  it("reads multiple files in one call", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/a.ts": "file a",
      "/b.ts": "file b",
    });
    const tool = createReadMultipleFilesTool(fs, mockModel, createContext());
    const result = await exec(tool, { paths: ["/a.ts", "/b.ts"] });
    expect(result).toContain("=== /a.ts ===");
    expect(result).toContain("file a");
    expect(result).toContain("=== /b.ts ===");
    expect(result).toContain("file b");
  });

  it("reports errors for missing files", async () => {
    const fs = new MemoryFileSystemAdapter({ "/a.ts": "exists" });
    const tool = createReadMultipleFilesTool(fs, mockModel, createContext());
    const result = await exec(tool, { paths: ["/a.ts", "/missing.ts"] });
    expect(result).toContain("=== /a.ts ===");
    expect(result).toContain("exists");
    expect(result).toContain("=== /missing.ts ===");
    expect(result).toContain("Error");
  });

  it("truncates large files", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/big.ts": "x".repeat(5000),
    });
    const tool = createReadMultipleFilesTool(fs, mockModel, createContext());
    const result = await exec(tool, { paths: ["/big.ts"] });
    expect(result).toContain("truncated");
  });
});
