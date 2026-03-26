import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createApplyDiffTool } from "#tools/applyDiff.js";
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

describe("applyDiff tool", () => {
  it("applies a simple unified diff", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/a.ts": "line1\nline2\nline3",
    });
    const ctx = createContext();
    const tool = createApplyDiffTool(fs, ctx);

    const diff = `@@ -1,3 +1,3 @@
 line1
-line2
+line2_modified
 line3`;

    const result = await exec(tool, { path: "/a.ts", diff });
    expect(result).toContain("Staged");
    expect(ctx.pendingChanges).toHaveLength(1);
    expect(ctx.pendingChanges[0].newContent).toBe("line1\nline2_modified\nline3");
  });

  it("errors on missing file", async () => {
    const fs = new MemoryFileSystemAdapter();
    const ctx = createContext();
    const tool = createApplyDiffTool(fs, ctx);
    const result = await exec(tool, { path: "/missing.ts", diff: "@@ -1 +1 @@\n-old\n+new" });
    expect(result).toContain("does not exist");
  });

  it("errors on invalid diff with no hunks", async () => {
    const fs = new MemoryFileSystemAdapter({ "/a.ts": "content" });
    const ctx = createContext();
    const tool = createApplyDiffTool(fs, ctx);
    const result = await exec(tool, { path: "/a.ts", diff: "not a diff" });
    expect(result).toContain("No valid hunks");
  });
});
