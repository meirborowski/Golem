import { describe, it, expect } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createReadFileTool } from "#tools/readFile.js";
import { createWriteFileTool } from "#tools/writeFile.js";
import { createListDirectoryTool } from "#tools/listDirectory.js";
import { createDirectoryTreeTool } from "#tools/directoryTree.js";
import { createExecuteCommandTool } from "#tools/executeCommand.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

function createContext(): AgentContext {
  return {
    messages: [],
    currentRequest: "test task",
    workingDirectory: "/project",
    gatheredFiles: new Map(),
    pendingChanges: [],
    shouldContinue: true,
    metadata: {},
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

// Helper to call a tool's execute function directly
const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("readFile tool", () => {
  it("reads small file content as-is", async () => {
    const fs = new MemoryFileSystemAdapter({ "/hello.txt": "world" });
    const tool = createReadFileTool(fs, createMockModel(), createContext());
    const result = await exec(tool, { path: "/hello.txt" });
    expect(result).toBe("world");
  });

  it("returns error string on missing file", async () => {
    const fs = new MemoryFileSystemAdapter();
    const tool = createReadFileTool(fs, createMockModel(), createContext());
    const result = await exec(tool, { path: "/missing.txt" });
    expect(result).toContain("Error reading /missing.txt");
  });

  it("summarizes large files via LLM", async () => {
    const largeContent = "x".repeat(5000);
    const fs = new MemoryFileSystemAdapter({ "/big.ts": largeContent });
    const model = createMockModel("// key exports only");
    const tool = createReadFileTool(fs, model, createContext());
    const result = await exec(tool, { path: "/big.ts" });
    expect(result).toContain("[Summarized");
    expect(result).toContain("// key exports only");
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("falls back to truncation if LLM fails", async () => {
    const largeContent = "y".repeat(5000);
    const fs = new MemoryFileSystemAdapter({ "/big.ts": largeContent });
    const model = new MockLanguageModelV3({
      doGenerate: async () => { throw new Error("API error"); },
    });
    const tool = createReadFileTool(fs, model, createContext());
    const result = await exec(tool, { path: "/big.ts" });
    expect(result).toContain("truncated");
    expect(result.length).toBeLessThan(largeContent.length);
  });
});

describe("writeFile tool", () => {
  it("stages a new file creation", async () => {
    const fs = new MemoryFileSystemAdapter();
    const ctx = createContext();
    const tool = createWriteFileTool(fs, ctx);

    const result = await exec(tool, { path: "/new.ts", content: "code" });
    expect(result).toContain("creation of");
    expect(ctx.pendingChanges).toHaveLength(1);
    expect(ctx.pendingChanges[0].operation).toBe("create");
    expect(ctx.pendingChanges[0].newContent).toBe("code");
  });

  it("stages a modification for existing file", async () => {
    const fs = new MemoryFileSystemAdapter({ "/existing.ts": "old" });
    const ctx = createContext();
    const tool = createWriteFileTool(fs, ctx);

    const result = await exec(tool, { path: "/existing.ts", content: "new" });
    expect(result).toContain("modification to");
    expect(ctx.pendingChanges[0].operation).toBe("modify");
    expect(ctx.pendingChanges[0].originalContent).toBe("old");
  });

  it("does NOT write to filesystem directly", async () => {
    const fs = new MemoryFileSystemAdapter();
    const ctx = createContext();
    const tool = createWriteFileTool(fs, ctx);

    await exec(tool, { path: "/file.ts", content: "data" });
    expect(await fs.exists("/file.ts")).toBe(false);
  });
});

describe("listDirectory tool", () => {
  it("lists files and directories", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "a",
      "/src/b.ts": "b",
    });
    const tool = createListDirectoryTool(fs);
    const result = await exec(tool, { path: "/src" });
    expect(result).toContain("[FILE] /src/a.ts");
    expect(result).toContain("[FILE] /src/b.ts");
  });
});

describe("directoryTree tool", () => {
  it("renders tree with box-drawing characters", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/core/agent.ts": "agent",
      "/src/core/entities/AgentContext.ts": "ctx",
      "/src/index.ts": "entry",
    });
    const tool = createDirectoryTreeTool(fs);
    const result = await exec(tool, { path: "/src" });
    expect(result).toContain("├── ");
    expect(result).toContain("└── ");
    expect(result).toContain("core/");
    expect(result).toContain("agent.ts");
    expect(result).toContain("index.ts");
  });

  it("respects depth limit", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/a/b/c/d/e.ts": "deep",
      "/a/top.ts": "shallow",
    });
    const tool = createDirectoryTreeTool(fs);
    const result = await exec(tool, { path: "/a", depth: 2 });
    expect(result).toContain("top.ts");
    // d/e.ts is at depth 4 from /a, should be excluded with depth 2
    expect(result).not.toContain("e.ts");
  });

  it("shows directories before files", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/proj/zebra.ts": "z",
      "/proj/alpha/a.ts": "a",
    });
    const tool = createDirectoryTreeTool(fs);
    const result = await exec(tool, { path: "/proj" });
    const lines = result.split("\n");
    const alphaLine = lines.findIndex((l: string) => l.includes("alpha/"));
    const zebraLine = lines.findIndex((l: string) => l.includes("zebra.ts"));
    expect(alphaLine).toBeLessThan(zebraLine);
  });

  it("returns empty for nonexistent path", async () => {
    const fs = new MemoryFileSystemAdapter();
    const tool = createDirectoryTreeTool(fs);
    const result = await exec(tool, { path: "/nope" });
    expect(result).toContain("empty");
  });
});

describe("executeCommand tool", () => {
  it("runs command and returns formatted output", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "hello\n", stderr: "", exitCode: 0 },
    ]);
    const tool = createExecuteCommandTool(mockExec, "/project");

    const result = await exec(tool, { command: "echo hello" });
    expect(result).toContain("Exit code: 0");
    expect(result).toContain("Stdout: hello");
    expect(mockExec.executedCommands).toEqual(["echo hello"]);
  });

  it("captures errors", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "fail", exitCode: 1 },
    ]);
    const tool = createExecuteCommandTool(mockExec);

    const result = await exec(tool, { command: "bad" });
    expect(result).toContain("Exit code: 1");
    expect(result).toContain("Stderr: fail");
  });
});
