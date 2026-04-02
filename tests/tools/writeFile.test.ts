import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createWriteFileTool } from "#tools/writeFile.js";
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

describe("writeFile tool", () => {
  it("stages a create for new file", async () => {
    const fs = new MemoryFileSystemAdapter();
    const ctx = createContext();
    const tool = createWriteFileTool(fs, ctx);

    const result = await exec(tool, { path: "/new.ts", content: "export const x = 1;" });
    expect(result).toContain("creation of");
    expect(ctx.pendingChanges).toHaveLength(1);
    expect(ctx.pendingChanges[0].operation).toBe("create");
    expect(ctx.pendingChanges[0].newContent).toBe("export const x = 1;");
    expect(ctx.pendingChanges[0].originalContent).toBeUndefined();
  });

  it("stages a modify for existing file with originalContent", async () => {
    const fs = new MemoryFileSystemAdapter({ "/existing.ts": "old content" });
    const ctx = createContext();
    const tool = createWriteFileTool(fs, ctx);

    const result = await exec(tool, { path: "/existing.ts", content: "new content" });
    expect(result).toContain("modification to");
    expect(ctx.pendingChanges[0].operation).toBe("modify");
    expect(ctx.pendingChanges[0].originalContent).toBe("old content");
    expect(ctx.pendingChanges[0].newContent).toBe("new content");
  });

  it("stages multiple writes to the same file", async () => {
    const fs = new MemoryFileSystemAdapter();
    const ctx = createContext();
    const tool = createWriteFileTool(fs, ctx);

    await exec(tool, { path: "/a.ts", content: "v1" });
    await exec(tool, { path: "/a.ts", content: "v2" });
    expect(ctx.pendingChanges).toHaveLength(2);
  });

  it("does not write to filesystem directly", async () => {
    const fs = new MemoryFileSystemAdapter();
    const ctx = createContext();
    const tool = createWriteFileTool(fs, ctx);

    await exec(tool, { path: "/file.ts", content: "data" });
    expect(await fs.exists("/file.ts")).toBe(false);
  });
});
