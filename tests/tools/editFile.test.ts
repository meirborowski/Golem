import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createEditFileTool } from "#tools/editFile.js";
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

describe("editFile tool", () => {
  it("stages a targeted replacement", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "const x = 1;\nconst y = 2;\nconst z = 3;",
    });
    const ctx = createContext();
    const tool = createEditFileTool(fs, ctx);

    const result = await exec(tool, {
      path: "/src/a.ts",
      oldText: "const y = 2;",
      newText: "const y = 42;",
    });

    expect(result).toContain("Staged edit");
    expect(ctx.pendingChanges).toHaveLength(1);
    expect(ctx.pendingChanges[0].newContent).toContain("const y = 42;");
    expect(ctx.pendingChanges[0].newContent).toContain("const x = 1;");
    expect(ctx.pendingChanges[0].newContent).toContain("const z = 3;");
  });

  it("errors on missing file", async () => {
    const fs = new MemoryFileSystemAdapter();
    const ctx = createContext();
    const tool = createEditFileTool(fs, ctx);

    const result = await exec(tool, {
      path: "/missing.ts",
      oldText: "foo",
      newText: "bar",
    });

    expect(result).toContain("does not exist");
    expect(ctx.pendingChanges).toHaveLength(0);
  });

  it("errors when oldText not found", async () => {
    const fs = new MemoryFileSystemAdapter({ "/a.ts": "hello world" });
    const ctx = createContext();
    const tool = createEditFileTool(fs, ctx);

    const result = await exec(tool, {
      path: "/a.ts",
      oldText: "goodbye",
      newText: "hi",
    });

    expect(result).toContain("Could not find");
    expect(ctx.pendingChanges).toHaveLength(0);
  });

  it("errors when oldText is ambiguous (multiple occurrences)", async () => {
    const fs = new MemoryFileSystemAdapter({ "/a.ts": "foo foo foo" });
    const ctx = createContext();
    const tool = createEditFileTool(fs, ctx);

    const result = await exec(tool, {
      path: "/a.ts",
      oldText: "foo",
      newText: "bar",
    });

    expect(result).toContain("3 occurrences");
    expect(ctx.pendingChanges).toHaveLength(0);
  });
});
