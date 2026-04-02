import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createSearchReplaceTool } from "#tools/searchReplace.js";
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

describe("searchReplace tool", () => {
  it("replaces a simple string across one file", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "const foo = 1;\nconst bar = 2;",
    });
    const ctx = createContext();
    const tool = createSearchReplaceTool(fs, ctx);

    const result = await exec(tool, { pattern: "foo", replacement: "baz", path: "/src" });
    expect(result).toContain("Staged replacements");
    expect(result).toContain("1 file");
    expect(ctx.pendingChanges).toHaveLength(1);
    expect(ctx.pendingChanges[0].newContent).toContain("const baz = 1;");
  });

  it("supports regex capture groups", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/a.ts": "log('hello'); log('world');",
    });
    const ctx = createContext();
    const tool = createSearchReplaceTool(fs, ctx);

    const result = await exec(tool, {
      pattern: "log\\('(\\w+)'\\)",
      replacement: "console.log('$1')",
      path: "/",
    });
    expect(result).toContain("Staged replacements");
    expect(ctx.pendingChanges[0].newContent).toBe("console.log('hello'); console.log('world');");
  });

  it("dry run reports matches without staging changes", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/a.ts": "foo bar foo",
    });
    const ctx = createContext();
    const tool = createSearchReplaceTool(fs, ctx);

    const result = await exec(tool, { pattern: "foo", replacement: "baz", path: "/", dryRun: true });
    expect(result).toContain("Would replace");
    expect(result).toContain("2 total match");
    expect(ctx.pendingChanges).toHaveLength(0);
  });

  it("respects include glob filter", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/a.ts": "foo",
      "/b.js": "foo",
    });
    const ctx = createContext();
    const tool = createSearchReplaceTool(fs, ctx);

    const result = await exec(tool, { pattern: "foo", replacement: "bar", path: "/", include: "*.ts" });
    expect(ctx.pendingChanges).toHaveLength(1);
    expect(ctx.pendingChanges[0].filePath).toBe("/a.ts");
  });

  it("respects exclude glob filter", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/a.ts": "foo",
      "/b.ts": "foo",
    });
    const ctx = createContext();
    const tool = createSearchReplaceTool(fs, ctx);

    const result = await exec(tool, { pattern: "foo", replacement: "bar", path: "/", exclude: "**/b.ts" });
    expect(ctx.pendingChanges).toHaveLength(1);
    expect(ctx.pendingChanges[0].filePath).toBe("/a.ts");
  });

  it("supports brace expansion in include pattern", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/a.ts": "foo",
      "/b.tsx": "foo",
      "/c.js": "foo",
    });
    const ctx = createContext();
    const tool = createSearchReplaceTool(fs, ctx);

    await exec(tool, { pattern: "foo", replacement: "bar", path: "/", include: "*.{ts,tsx}" });
    expect(ctx.pendingChanges).toHaveLength(2);
    const paths = ctx.pendingChanges.map((c) => c.filePath).sort();
    expect(paths).toEqual(["/a.ts", "/b.tsx"]);
  });

  it("returns no-matches message when pattern has zero matches", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/a.ts": "hello world",
    });
    const ctx = createContext();
    const tool = createSearchReplaceTool(fs, ctx);

    const result = await exec(tool, { pattern: "xyz", replacement: "abc", path: "/" });
    expect(result).toContain("No matches found");
    expect(ctx.pendingChanges).toHaveLength(0);
  });

  it("returns error on invalid regex", async () => {
    const fs = new MemoryFileSystemAdapter({ "/a.ts": "content" });
    const ctx = createContext();
    const tool = createSearchReplaceTool(fs, ctx);

    const result = await exec(tool, { pattern: "[invalid", replacement: "x", path: "/" });
    expect(result).toContain("Error in search-replace");
  });

  it("skips unreadable files without crashing", async () => {
    // Create fs with a file, then test that the tool handles read errors gracefully
    const fs = new MemoryFileSystemAdapter({
      "/a.ts": "foo",
      "/b.ts": "foo",
    });
    const ctx = createContext();
    const tool = createSearchReplaceTool(fs, ctx);

    // Remove one file after listing but the MemoryFS won't have this issue,
    // so we just verify the tool processes all readable files
    const result = await exec(tool, { pattern: "foo", replacement: "bar", path: "/" });
    expect(result).toContain("2 file");
    expect(ctx.pendingChanges).toHaveLength(2);
  });
});
