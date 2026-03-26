import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createSearchFilesTool } from "#tools/searchFiles.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("searchFiles tool", () => {
  it("finds matching lines across files", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "export function hello() {}\nexport function world() {}",
      "/src/b.ts": "import { hello } from './a';",
    });
    const tool = createSearchFilesTool(fs);
    const result = await exec(tool, { pattern: "hello", path: "/" });
    expect(result).toContain("/src/a.ts:1:");
    expect(result).toContain("/src/b.ts:1:");
  });

  it("returns no matches message when nothing found", async () => {
    const fs = new MemoryFileSystemAdapter({ "/src/a.ts": "foo" });
    const tool = createSearchFilesTool(fs);
    const result = await exec(tool, { pattern: "zzz", path: "/" });
    expect(result).toContain("No matches found");
  });

  it("respects include glob filter", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "hello",
      "/src/b.js": "hello",
    });
    const tool = createSearchFilesTool(fs);
    const result = await exec(tool, { pattern: "hello", path: "/", include: "*.ts" });
    expect(result).toContain("/src/a.ts");
    expect(result).not.toContain("/src/b.js");
  });

  it("respects maxResults", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "match\nmatch\nmatch\nmatch\nmatch",
    });
    const tool = createSearchFilesTool(fs);
    const result = await exec(tool, { pattern: "match", path: "/", maxResults: 2 });
    expect(result).toContain("reached limit of 2");
  });

  it("supports regex patterns", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "const foo = 42;\nconst bar = 99;",
    });
    const tool = createSearchFilesTool(fs);
    const result = await exec(tool, { pattern: "const \\w+ = \\d+", path: "/" });
    expect(result).toContain("/src/a.ts:1:");
    expect(result).toContain("/src/a.ts:2:");
  });
});
