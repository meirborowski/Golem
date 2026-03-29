import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createDiagnosticsTool } from "#tools/diagnostics.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("diagnostics tool", () => {
  it("auto-detects tsc from tsconfig.json", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/tsconfig.json": "{}",
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    const result = await exec(tool, {});

    expect(result).toContain("Tool: tsc");
    expect(result).toContain("CLEAN");
    expect(mockExec.executedCommands[0]).toBe("npx tsc --noEmit");
  });

  it("auto-detects eslint from config file", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/eslint.config.js": "export default []",
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    const result = await exec(tool, {});

    expect(result).toContain("Tool: eslint");
    expect(mockExec.executedCommands[0]).toContain("eslint");
  });

  it("auto-detects eslint from package.json devDependencies", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/package.json": JSON.stringify({ devDependencies: { eslint: "^9.0.0" } }),
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    const result = await exec(tool, {});

    expect(result).toContain("Tool: eslint");
  });

  it("auto-detects biome from biome.json", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/biome.json": "{}",
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    const result = await exec(tool, {});

    expect(result).toContain("Tool: biome");
    expect(mockExec.executedCommands[0]).toContain("biome check");
  });

  it("auto-detects ruff from pyproject.toml", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/pyproject.toml": "[tool.ruff]\nselect = ['E']",
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    const result = await exec(tool, {});

    expect(result).toContain("Tool: ruff");
    expect(mockExec.executedCommands[0]).toContain("ruff check");
  });

  it("auto-detects golangci-lint from config", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/.golangci.yml": "linters:\n  enable:\n    - errcheck",
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    const result = await exec(tool, {});

    expect(result).toContain("Tool: golangci-lint");
    expect(mockExec.executedCommands[0]).toContain("golangci-lint run");
  });

  it("runs multiple detected tools", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/tsconfig.json": "{}",
      "/project/eslint.config.js": "export default []",
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    const result = await exec(tool, {});

    expect(result).toContain("Tool: tsc");
    expect(result).toContain("Tool: eslint");
    expect(mockExec.executedCommands).toHaveLength(2);
  });

  it("parses tsc error summary", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/tsconfig.json": "{}",
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "Found 3 errors in 2 files.", stderr: "", exitCode: 1 },
    ]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    const result = await exec(tool, {});

    expect(result).toContain("ISSUES FOUND");
    expect(result).toContain("3 error(s) in 2 file(s)");
  });

  it("parses eslint error summary", async () => {
    const fs = new MemoryFileSystemAdapter({});
    const mockExec = new MockExecutionEnvironment([
      { stdout: "5 problems (2 errors, 3 warnings)", stderr: "", exitCode: 1 },
    ]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    const result = await exec(tool, { tool: "eslint" });

    expect(result).toContain("2 error(s), 3 warning(s)");
  });

  it("supports --fix via fix parameter", async () => {
    const fs = new MemoryFileSystemAdapter({});
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    await exec(tool, { tool: "eslint", fix: true });

    expect(mockExec.executedCommands[0]).toContain("--fix");
  });

  it("supports custom command override", async () => {
    const fs = new MemoryFileSystemAdapter({});
    const mockExec = new MockExecutionEnvironment([
      { stdout: "all good", stderr: "", exitCode: 0 },
    ]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    const result = await exec(tool, { command: "mypy src/" });

    expect(result).toContain("Tool: custom");
    expect(result).toContain("Command: mypy src/");
    expect(mockExec.executedCommands[0]).toBe("mypy src/");
  });

  it("returns error when no tools detected", async () => {
    const fs = new MemoryFileSystemAdapter({});
    const mockExec = new MockExecutionEnvironment([]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    const result = await exec(tool, {});

    expect(result).toContain("No diagnostic tools detected");
  });

  it("targets specific path", async () => {
    const fs = new MemoryFileSystemAdapter({});
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createDiagnosticsTool(mockExec, fs, "/project");
    await exec(tool, { tool: "eslint", path: "src/index.ts" });

    expect(mockExec.executedCommands[0]).toContain("src/index.ts");
  });
});
