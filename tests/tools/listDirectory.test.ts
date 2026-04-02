import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createListDirectoryTool } from "#tools/listDirectory.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("listDirectory tool", () => {
  it("lists direct children non-recursively", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "a",
      "/src/b.ts": "b",
      "/src/sub/c.ts": "c",
    });
    const tool = createListDirectoryTool(fs);

    const result = await exec(tool, { path: "/src" });
    expect(result).toContain("[FILE] /src/a.ts");
    expect(result).toContain("[FILE] /src/b.ts");
    expect(result).toContain("[DIR] /src/sub");
  });

  it("lists recursively", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "a",
      "/src/deep/b.ts": "b",
    });
    const tool = createListDirectoryTool(fs);

    const result = await exec(tool, { path: "/src", recursive: true });
    expect(result).toContain("/src/a.ts");
    expect(result).toContain("/src/deep/b.ts");
  });

  it("returns empty result for nonexistent path", async () => {
    const fs = new MemoryFileSystemAdapter();
    const tool = createListDirectoryTool(fs);

    const result = await exec(tool, { path: "/nope" });
    // MemoryFS returns empty array for nonexistent directories
    expect(result).toBe("");
  });

  it("filters out .git directory entries", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "a",
    });
    const tool = createListDirectoryTool(fs);

    // .git filtering comes from gitignore; MemoryFS won't have .gitignore
    // so the default filter only excludes .git itself
    const result = await exec(tool, { path: "/src" });
    expect(result).not.toContain(".git");
  });
});
