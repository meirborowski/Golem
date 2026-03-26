import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createCreateDirectoryTool } from "#tools/createDirectory.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("createDirectory tool", () => {
  it("creates a directory", async () => {
    const fs = new MemoryFileSystemAdapter();
    const tool = createCreateDirectoryTool(fs);

    const result = await exec(tool, { path: "/src/new" });
    expect(result).toContain("Created directory");
    // MemoryFileSystemAdapter should now recognize this path
    const stat = await fs.stat("/src/new");
    expect(stat.isDirectory).toBe(true);
  });

  it("creates nested directories", async () => {
    const fs = new MemoryFileSystemAdapter();
    const tool = createCreateDirectoryTool(fs);

    const result = await exec(tool, { path: "/deep/nested/dir" });
    expect(result).toContain("Created directory");
    expect(await fs.exists("/deep/nested/dir")).toBe(true);
  });
});
