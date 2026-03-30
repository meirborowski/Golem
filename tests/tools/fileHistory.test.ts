import { describe, it, expect } from "vitest";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createFileHistoryTool } from "#tools/fileHistory.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("fileHistory tool", () => {
  it("runs git log --follow for the given file", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "a1b2c3d 2026-03-28 Alice  Refactor agent loop\n agent.ts | 42 ++++----\n", stderr: "", exitCode: 0 },
    ]);
    const tool = createFileHistoryTool(mockExec, "/project");
    const result = await exec(tool, { path: "src/agent.ts" });

    expect(result).toContain("a1b2c3d");
    expect(result).toContain("Refactor agent loop");
    expect(mockExec.executedCommands[0]).toContain("--follow");
    expect(mockExec.executedCommands[0]).toContain("-- src/agent.ts");
  });

  it("uses --stat by default", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "abc 2026-01-01 Bob  Init\n", stderr: "", exitCode: 0 },
    ]);
    const tool = createFileHistoryTool(mockExec, "/project");
    await exec(tool, { path: "file.ts" });

    expect(mockExec.executedCommands[0]).toContain("--stat");
  });

  it("adds --patch when diff is true", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "abc 2026-01-01 Bob  Init\n+line\n", stderr: "", exitCode: 0 },
    ]);
    const tool = createFileHistoryTool(mockExec, "/project");
    await exec(tool, { path: "file.ts", diff: true });

    expect(mockExec.executedCommands[0]).toContain("--patch");
  });

  it("respects count parameter", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "abc 2026-01-01 Bob  Init\n", stderr: "", exitCode: 0 },
    ]);
    const tool = createFileHistoryTool(mockExec, "/project");
    await exec(tool, { path: "file.ts", count: 5 });

    expect(mockExec.executedCommands[0]).toContain("-n5");
  });

  it("defaults to 10 commits", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "abc 2026-01-01 Bob  Init\n", stderr: "", exitCode: 0 },
    ]);
    const tool = createFileHistoryTool(mockExec, "/project");
    await exec(tool, { path: "file.ts" });

    expect(mockExec.executedCommands[0]).toContain("-n10");
  });

  it("returns friendly message when no history found", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createFileHistoryTool(mockExec, "/project");
    const result = await exec(tool, { path: "new-file.ts" });

    expect(result).toContain("No history found");
    expect(result).toContain("new-file.ts");
  });

  it("returns error on git failure", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "fatal: not a git repository", exitCode: 128 },
    ]);
    const tool = createFileHistoryTool(mockExec, "/project");
    const result = await exec(tool, { path: "file.ts" });

    expect(result).toContain("Error:");
    expect(result).toContain("not a git repository");
  });

  it("truncates very long output", async () => {
    const longOutput = "x".repeat(20000);
    const mockExec = new MockExecutionEnvironment([
      { stdout: longOutput, stderr: "", exitCode: 0 },
    ]);
    const tool = createFileHistoryTool(mockExec, "/project");
    const result = await exec(tool, { path: "file.ts" });

    expect(result).toContain("truncated");
    expect(result).toContain("20000 total chars");
    expect(result.length).toBeLessThan(longOutput.length);
  });
});
