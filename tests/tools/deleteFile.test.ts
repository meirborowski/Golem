import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createDeleteFileTool } from "#tools/deleteFile.js";
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

describe("deleteFile tool", () => {
  it("stages a file deletion", async () => {
    const fs = new MemoryFileSystemAdapter({ "/src/old.ts": "content" });
    const ctx = createContext();
    const tool = createDeleteFileTool(fs, ctx);

    const result = await exec(tool, { path: "/src/old.ts" });
    expect(result).toContain("Staged deletion");
    expect(ctx.pendingChanges).toHaveLength(1);
    expect(ctx.pendingChanges[0].operation).toBe("delete");
    expect(ctx.pendingChanges[0].originalContent).toBe("content");
  });

  it("errors on missing file", async () => {
    const fs = new MemoryFileSystemAdapter();
    const ctx = createContext();
    const tool = createDeleteFileTool(fs, ctx);

    const result = await exec(tool, { path: "/missing.ts" });
    expect(result).toContain("does not exist");
    expect(ctx.pendingChanges).toHaveLength(0);
  });

  it("does not delete from filesystem directly", async () => {
    const fs = new MemoryFileSystemAdapter({ "/a.ts": "keep" });
    const ctx = createContext();
    const tool = createDeleteFileTool(fs, ctx);

    await exec(tool, { path: "/a.ts" });
    expect(await fs.exists("/a.ts")).toBe(true);
  });
});
