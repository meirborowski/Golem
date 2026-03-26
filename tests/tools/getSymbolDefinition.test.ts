import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createGetSymbolDefinitionTool } from "#tools/getSymbolDefinition.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("getSymbolDefinition tool", () => {
  it("finds function definitions", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/utils.ts": "export function calculateTotal(items: Item[]) {\n  return items.reduce((sum, i) => sum + i.price, 0);\n}",
    });
    const tool = createGetSymbolDefinitionTool(fs);
    const result = await exec(tool, { symbol: "calculateTotal", path: "/" });
    expect(result).toContain("/src/utils.ts:1");
    expect(result).toContain("function calculateTotal");
  });

  it("finds class definitions", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/agent.ts": "import { stuff } from 'lib';\n\nexport class Agent {\n  run() {}\n}",
    });
    const tool = createGetSymbolDefinitionTool(fs);
    const result = await exec(tool, { symbol: "Agent", path: "/" });
    expect(result).toContain("/src/agent.ts:3");
    expect(result).toContain("class Agent");
  });

  it("finds interface definitions", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/types.ts": "export interface IFileSystem {\n  readFile(path: string): Promise<string>;\n}",
    });
    const tool = createGetSymbolDefinitionTool(fs);
    const result = await exec(tool, { symbol: "IFileSystem", path: "/" });
    expect(result).toContain("interface IFileSystem");
  });

  it("finds type alias definitions", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/types.ts": "export type Result<T> = { ok: true; data: T } | { ok: false; error: string };",
    });
    const tool = createGetSymbolDefinitionTool(fs);
    const result = await exec(tool, { symbol: "Result", path: "/" });
    expect(result).toContain("type Result");
  });

  it("returns not found for unknown symbols", async () => {
    const fs = new MemoryFileSystemAdapter({ "/src/a.ts": "const x = 1;" });
    const tool = createGetSymbolDefinitionTool(fs);
    const result = await exec(tool, { symbol: "NonExistent", path: "/" });
    expect(result).toContain("No definition found");
  });
});
