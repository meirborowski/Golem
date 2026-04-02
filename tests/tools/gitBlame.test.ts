import { describe, it, expect } from "vitest";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createGitBlameTool } from "#tools/gitBlame.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("gitBlame tool", () => {
  it("returns blame output for a file", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "abc1234 (Author 2024-01-01 10:00:00 +0000 1) const x = 1;", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitBlameTool(mockExec, "/project");

    const result = await exec(tool, { path: "src/index.ts" });
    expect(result).toContain("abc1234");
    expect(result).toContain("const x = 1;");
  });

  it("passes -L flag when startLine and endLine provided", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "blame output", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitBlameTool(mockExec, "/project");

    await exec(tool, { path: "src/index.ts", startLine: 5, endLine: 10 });
    expect(mockExec.executedCommands[0]).toContain("-L5,10");
  });

  it("returns error when git blame fails", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "fatal: no such path", exitCode: 128 },
    ]);
    const tool = createGitBlameTool(mockExec, "/project");

    const result = await exec(tool, { path: "nonexistent.ts" });
    expect(result).toContain("Error");
    expect(result).toContain("no such path");
  });

  it("returns no-output message for empty stdout", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitBlameTool(mockExec, "/project");

    const result = await exec(tool, { path: "empty.ts" });
    expect(result).toContain("No blame output");
  });
});
