import { describe, it, expect } from "vitest";
import { MemoryFileSystemAdapter } from "#adapters/fs/MemoryFileSystemAdapter.js";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createRunTestsTool } from "#tools/runTests.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

// detectFramework uses `${cwd}/package.json`, so cwd must not have trailing slash
const CWD = "/project";

describe("runTests tool", () => {
  it("detects vitest from package.json", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "Tests  1 passed (1)\n", stderr: "", exitCode: 0 },
    ]);
    const tool = createRunTestsTool(mockExec, fs, CWD);

    const result = await exec(tool, {});
    expect(result).toContain("Framework: vitest");
    expect(result).toContain("npx vitest run");
    expect(result).toContain("PASSED");
  });

  it("detects jest from package.json", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/package.json": JSON.stringify({ scripts: { test: "jest" } }),
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "Tests:  1 passed, 1 total", stderr: "", exitCode: 0 },
    ]);
    const tool = createRunTestsTool(mockExec, fs, CWD);

    const result = await exec(tool, {});
    expect(result).toContain("Framework: jest");
    expect(result).toContain("npx jest");
  });

  it("detects pytest from pytest.ini", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/pytest.ini": "[pytest]\naddopts = -v",
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "=== 3 passed in 1.2s ===", stderr: "", exitCode: 0 },
    ]);
    const tool = createRunTestsTool(mockExec, fs, CWD);

    const result = await exec(tool, {});
    expect(result).toContain("Framework: pytest");
    expect(result).toContain("pytest");
  });

  it("detects pytest from pyproject.toml with [tool.pytest section", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/pyproject.toml": "[tool.pytest.ini_options]\naddopts = '-v'",
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "=== 2 passed in 0.5s ===", stderr: "", exitCode: 0 },
    ]);
    const tool = createRunTestsTool(mockExec, fs, CWD);

    const result = await exec(tool, {});
    expect(result).toContain("Framework: pytest");
  });

  it("detects Go from go.mod", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/go.mod": "module example.com/myapp\ngo 1.21",
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "ok  example.com/myapp 0.3s", stderr: "", exitCode: 0 },
    ]);
    const tool = createRunTestsTool(mockExec, fs, CWD);

    const result = await exec(tool, {});
    expect(result).toContain("Framework: go");
    expect(result).toContain("go test");
  });

  it("returns error when no framework detected", async () => {
    const fs = new MemoryFileSystemAdapter({});
    const mockExec = new MockExecutionEnvironment([]);
    const tool = createRunTestsTool(mockExec, fs, CWD);

    const result = await exec(tool, {});
    expect(result).toContain("Could not detect test framework");
  });

  it("uses custom command when provided", async () => {
    const fs = new MemoryFileSystemAdapter({});
    const mockExec = new MockExecutionEnvironment([
      { stdout: "all good", stderr: "", exitCode: 0 },
    ]);
    const tool = createRunTestsTool(mockExec, fs, CWD);

    const result = await exec(tool, { command: "my-test-runner --all" });
    expect(result).toContain("Framework: custom");
    expect(mockExec.executedCommands[0]).toBe("my-test-runner --all");
  });

  it("builds vitest command with path and pattern", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createRunTestsTool(mockExec, fs, CWD);

    await exec(tool, { path: "src/auth", pattern: "login" });
    expect(mockExec.executedCommands[0]).toBe('npx vitest run src/auth --testNamePattern "login"');
  });

  it("builds pytest command with path and -k", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/pytest.ini": "[pytest]",
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createRunTestsTool(mockExec, fs, CWD);

    await exec(tool, { path: "tests/auth", pattern: "login" });
    expect(mockExec.executedCommands[0]).toBe('pytest tests/auth -k "login"');
  });

  it("reports FAILED status on non-zero exit code", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/package.json": JSON.stringify({ scripts: { test: "vitest" } }),
    });
    const mockExec = new MockExecutionEnvironment([
      { stdout: "FAIL src/test.ts", stderr: "", exitCode: 1 },
    ]);
    const tool = createRunTestsTool(mockExec, fs, CWD);

    const result = await exec(tool, {});
    expect(result).toContain("Status: FAILED");
  });

  it("truncates output exceeding 10000 chars", async () => {
    const fs = new MemoryFileSystemAdapter({
      "/project/package.json": JSON.stringify({ scripts: { test: "vitest" } }),
    });
    const longOutput = "x".repeat(15000);
    const mockExec = new MockExecutionEnvironment([
      { stdout: longOutput, stderr: "", exitCode: 0 },
    ]);
    const tool = createRunTestsTool(mockExec, fs, CWD);

    const result = await exec(tool, {});
    expect(result).toContain("showing last 10000 chars");
  });
});
