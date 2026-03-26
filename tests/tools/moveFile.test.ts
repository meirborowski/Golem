import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createMoveFileTool } from "#tools/moveFile.js";
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

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("moveFile tool", () => {
  it("stages delete + create for a move", async () => {
    const fs = new MemoryFileSystemAdapter({ "/src/old.ts": "content" });
    const ctx = createContext();
    const tool = createMoveFileTool(fs, ctx);

    const result = await exec(tool, { source: "/src/old.ts", destination: "/src/new.ts" });
    expect(result).toContain("Staged move");
    expect(ctx.pendingChanges).toHaveLength(2);
    expect(ctx.pendingChanges[0].operation).toBe("delete");
    expect(ctx.pendingChanges[0].filePath).toBe("/src/old.ts");
    expect(ctx.pendingChanges[1].operation).toBe("create");
    expect(ctx.pendingChanges[1].filePath).toBe("/src/new.ts");
    expect(ctx.pendingChanges[1].newContent).toBe("content");
  });

  it("errors when source does not exist", async () => {
    const fs = new MemoryFileSystemAdapter();
    const ctx = createContext();
    const tool = createMoveFileTool(fs, ctx);

    const result = await exec(tool, { source: "/missing.ts", destination: "/new.ts" });
    expect(result).toContain("does not exist");
  });

  it("errors when destination already exists", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/a.ts": "a",
      "/b.ts": "b",
    });
    const ctx = createContext();
    const tool = createMoveFileTool(fs, ctx);

    const result = await exec(tool, { source: "/a.ts", destination: "/b.ts" });
    expect(result).toContain("already exists");
  });
});
