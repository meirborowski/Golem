import { describe, it, expect, beforeEach } from "vitest";
import { MemoryFileSystemAdapter } from "../../src/adapters/fs/MemoryFileSystemAdapter.js";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createReadFileTool } from "../../src/tools/readFile.js";
import { createWriteFileTool } from "../../src/tools/writeFile.js";
import { createListDirectoryTool } from "../../src/tools/listDirectory.js";
import { createExecuteCommandTool } from "../../src/tools/executeCommand.js";
import type { AgentContext } from "../../src/core/entities/AgentContext.js";

function createContext(): AgentContext {
  return {
    messages: [],
    currentRequest: "",
    workingDirectory: "/project",
    gatheredFiles: new Map(),
    pendingChanges: [],
    shouldContinue: true,
    metadata: {},
  };
}

// Helper to call a tool's execute function directly
const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("readFile tool", () => {
  it("reads file content", async () => {
    const fs = new MemoryFileSystemAdapter({ "/hello.txt": "world" });
    const tool = createReadFileTool(fs);
    const result = await exec(tool, { path: "/hello.txt" });
    expect(result).toBe("world");
  });

  it("throws on missing file", async () => {
    const fs = new MemoryFileSystemAdapter();
    const tool = createReadFileTool(fs);
    await expect(exec(tool, { path: "/missing.txt" })).rejects.toThrow();
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
