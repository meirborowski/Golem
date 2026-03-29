import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { createListSymbolsTool } from "#tools/listSymbols.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("listSymbols tool", () => {
  it("lists functions, classes, interfaces, types, and consts", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/src/types.ts": [
        "export interface IFileSystem {",
        "  readFile(path: string): Promise<string>;",
        "}",
        "",
        "export type Result<T> = { ok: true; data: T };",
        "",
        "export const MAX = 100;",
        "",
        "export function run() {}",
        "",
        "export class Agent {",
        "  execute() {}",
        "}",
        "",
        "export enum Status {",
        "  Active,",
        "}",
      ].join("\n"),
    });
    const tool = createListSymbolsTool(fs);
    const result = await exec(tool, { path: "/src/types.ts" });

    expect(result).toContain("interface");
    expect(result).toContain("IFileSystem");
    expect(result).toContain("type");
    expect(result).toContain("Result");
    expect(result).toContain("const");
    expect(result).toContain("MAX");
    expect(result).toContain("function");
    expect(result).toContain("run");
    expect(result).toContain("class");
    expect(result).toContain("Agent");
    expect(result).toContain("enum");
    expect(result).toContain("Status");
    expect(result).toContain("(6)");
  });

  it("lists Python symbols (top-level only)", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/app.py": [
        "class Server:",
        "    def handle(self):",
        "        pass",
        "",
        "def main():",
        "    pass",
        "",
        "async def fetch():",
        "    pass",
      ].join("\n"),
    });
    const tool = createListSymbolsTool(fs);
    const result = await exec(tool, { path: "/app.py" });

    expect(result).toContain("class");
    expect(result).toContain("Server");
    expect(result).toContain("function");
    expect(result).toContain("main");
    expect(result).toContain("fetch");
    // Indented method should not appear (Python patterns require no leading whitespace)
    expect(result).not.toContain("handle");
  });

  it("lists Go symbols", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/main.go": [
        "package main",
        "",
        "type Server struct {",
        "    port int",
        "}",
        "",
        "func main() {",
        "}",
        "",
        "var defaultPort = 8080",
      ].join("\n"),
    });
    const tool = createListSymbolsTool(fs);
    const result = await exec(tool, { path: "/main.go" });

    expect(result).toContain("type");
    expect(result).toContain("Server");
    expect(result).toContain("function");
    expect(result).toContain("main");
    expect(result).toContain("var");
    expect(result).toContain("defaultPort");
  });

  it("lists Rust symbols", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/lib.rs": [
        "pub struct Config {",
        "    port: u16,",
        "}",
        "",
        "pub fn start(config: Config) {}",
        "",
        "trait Handler {",
        "    fn handle(&self);",
        "}",
      ].join("\n"),
    });
    const tool = createListSymbolsTool(fs);
    const result = await exec(tool, { path: "/lib.rs" });

    expect(result).toContain("struct");
    expect(result).toContain("Config");
    expect(result).toContain("function");
    expect(result).toContain("start");
    expect(result).toContain("trait");
    expect(result).toContain("Handler");
  });

  it("returns not found for empty file", async () => {
    const fs = new MemoryFileSystemAdapter({ "/empty.ts": "" });
    const tool = createListSymbolsTool(fs);
    const result = await exec(tool, { path: "/empty.ts" });
    expect(result).toContain("No symbols found");
  });

  it("returns error for missing file", async () => {
    const fs = new MemoryFileSystemAdapter({});
    const tool = createListSymbolsTool(fs);
    const result = await exec(tool, { path: "/missing.ts" });
    expect(result).toContain("Error:");
  });

  it("truncates long lines", async () => {
    const longName = "a".repeat(100);
    const fs = new MemoryFileSystemAdapter({
      "/long.ts": `export function ${longName}() {}`,
    });
    const tool = createListSymbolsTool(fs);
    const result = await exec(tool, { path: "/long.ts" });
    expect(result).toContain("…");
  });
});
