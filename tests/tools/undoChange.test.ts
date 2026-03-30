import { describe, it, expect } from "vitest";
import { createUndoChangeTool } from "#tools/undoChange.js";
import type { AgentContext } from "#core/entities/AgentContext.js";
import type { FileChange } from "#core/entities/FileChange.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

function createContext(changes: FileChange[]): AgentContext {
  return {
    messages: [],
    currentRequest: "test task",
    workingDirectory: "/project",
    gatheredFiles: new Map(),
    pendingChanges: changes,
    shouldContinue: true,
    metadata: {},
  };
}

describe("undoChange tool", () => {
  it("removes a pending change by filePath", async () => {
    const context = createContext([
      { filePath: "/src/a.ts", operation: "modify", originalContent: "old", newContent: "new" },
      { filePath: "/src/b.ts", operation: "create", newContent: "content" },
    ]);
    const tool = createUndoChangeTool(context);
    const result = await exec(tool, { filePath: "/src/a.ts" });

    expect(result).toContain("Removed 1 pending change(s)");
    expect(result).toContain("1 change(s) remaining");
    expect(context.pendingChanges).toHaveLength(1);
    expect(context.pendingChanges[0].filePath).toBe("/src/b.ts");
  });

  it("removes multiple changes for the same file", async () => {
    const context = createContext([
      { filePath: "/src/a.ts", operation: "delete", originalContent: "old" },
      { filePath: "/src/a.ts", operation: "create", newContent: "new" },
      { filePath: "/src/b.ts", operation: "modify", originalContent: "x", newContent: "y" },
    ]);
    const tool = createUndoChangeTool(context);
    const result = await exec(tool, { filePath: "/src/a.ts" });

    expect(result).toContain("Removed 2 pending change(s)");
    expect(result).toContain("1 change(s) remaining");
    expect(context.pendingChanges).toHaveLength(1);
  });

  it("returns not found with list of pending files", async () => {
    const context = createContext([
      { filePath: "/src/a.ts", operation: "modify", originalContent: "old", newContent: "new" },
    ]);
    const tool = createUndoChangeTool(context);
    const result = await exec(tool, { filePath: "/src/missing.ts" });

    expect(result).toContain("No pending changes found");
    expect(result).toContain("/src/a.ts");
    expect(context.pendingChanges).toHaveLength(1);
  });

  it("returns message when no pending changes exist", async () => {
    const context = createContext([]);
    const tool = createUndoChangeTool(context);
    const result = await exec(tool, { filePath: "/src/a.ts" });

    expect(result).toContain("No pending changes to undo");
  });

  it("leaves other changes untouched", async () => {
    const context = createContext([
      { filePath: "/src/a.ts", operation: "modify", originalContent: "old", newContent: "new" },
      { filePath: "/src/b.ts", operation: "create", newContent: "b" },
      { filePath: "/src/c.ts", operation: "delete", originalContent: "c" },
    ]);
    const tool = createUndoChangeTool(context);
    await exec(tool, { filePath: "/src/b.ts" });

    expect(context.pendingChanges).toHaveLength(2);
    expect(context.pendingChanges.map((c) => c.filePath)).toEqual(["/src/a.ts", "/src/c.ts"]);
  });
});
