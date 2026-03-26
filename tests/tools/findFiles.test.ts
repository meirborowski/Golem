import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createFindFilesTool } from "#tools/findFiles.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("findFiles tool", () => {
  it("finds files matching a glob pattern", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "a",
      "/src/b.ts": "b",
      "/src/c.js": "c",
    });
    const tool = createFindFilesTool(fs);
    const result = await exec(tool, { pattern: "*.ts", path: "/" });
    expect(result).toContain("/src/a.ts");
    expect(result).toContain("/src/b.ts");
    expect(result).not.toContain("/src/c.js");
  });

  it("returns no matches when pattern matches nothing", async () => {
    const fs = new MemoryFileSystemAdapter({ "/src/a.ts": "a" });
    const tool = createFindFilesTool(fs);
    const result = await exec(tool, { pattern: "*.py", path: "/" });
    expect(result).toContain("No files matching");
  });

  it("supports ** glob patterns", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/tests/a.test.ts": "test",
      "/src/deep/nested/b.test.ts": "test",
      "/src/main.ts": "main",
    });
    const tool = createFindFilesTool(fs);
    const result = await exec(tool, { pattern: "**/*.test.ts", path: "/" });
    expect(result).toContain("a.test.ts");
    expect(result).toContain("b.test.ts");
    expect(result).not.toContain("main.ts");
  });

  it("scopes search to a specific path", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "a",
      "/lib/b.ts": "b",
    });
    const tool = createFindFilesTool(fs);
    const result = await exec(tool, { pattern: "*.ts", path: "/src" });
    expect(result).toContain("/src/a.ts");
    expect(result).not.toContain("/lib/b.ts");
  });
});
