import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createMaxDepthTool } from "#tools/maxDepth.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("maxDepth tool", () => {
  it("returns correct max depth for nested structure", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "a",
      "/src/core/b.ts": "b",
      "/src/core/entities/c.ts": "c",
    });
    const tool = createMaxDepthTool(fs);

    const result = await exec(tool, { path: "/src" });
    expect(result).toContain("Max depth: 3");
    expect(result).toContain("Deepest: /src/core/entities/c.ts");
  });

  it("returns depth distribution", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/a.ts": "a",
      "/src/b.ts": "b",
      "/src/sub/c.ts": "c",
    });
    const tool = createMaxDepthTool(fs);

    const result = await exec(tool, { path: "/src" });
    expect(result).toContain("Distribution:");
    expect(result).toContain("depth");
  });

  it("handles empty directory", async () => {
    const fs = new MemoryFileSystemAdapter({});
    // MemoryFS won't have any entries under /empty
    const tool = createMaxDepthTool(fs);

    const result = await exec(tool, { path: "/empty" });
    expect(result).toContain("empty");
  });

  it("returns total entry count", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/proj/a.ts": "a",
      "/proj/b.ts": "b",
      "/proj/c.ts": "c",
    });
    const tool = createMaxDepthTool(fs);

    const result = await exec(tool, { path: "/proj" });
    expect(result).toContain("Total entries:");
  });
});
