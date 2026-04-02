import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createDirectoryTreeTool } from "#tools/directoryTree.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("directoryTree tool", () => {
  it("renders tree with box-drawing characters", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/core/agent.ts": "agent",
      "/src/index.ts": "entry",
    });
    const tool = createDirectoryTreeTool(fs);

    const result = await exec(tool, { path: "/src" });
    expect(result).toContain("├── ");
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
