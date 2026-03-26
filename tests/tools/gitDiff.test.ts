import { describe, it, expect } from "vitest";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createGitDiffTool } from "#tools/gitDiff.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("gitDiff tool", () => {
  it("returns unstaged diff", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "diff --git a/file.ts\n-old\n+new", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitDiffTool(mockExec, "/project");
    const result = await exec(tool, {});
    expect(result).toContain("-old");
    expect(result).toContain("+new");
  });

  it("passes --cached for staged diffs", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "staged diff", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitDiffTool(mockExec);
    await exec(tool, { staged: true });
    expect(mockExec.executedCommands[0]).toContain("--cached");
  });

  it("reports no changes", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitDiffTool(mockExec);
    const result = await exec(tool, {});
    expect(result).toContain("No unstaged changes");
  });

  it("truncates very large diffs", async () => {
    const largeDiff = "x".repeat(20000);
    const mockExec = new MockExecutionEnvironment([
      { stdout: largeDiff, stderr: "", exitCode: 0 },
    ]);
    const tool = createGitDiffTool(mockExec);
    const result = await exec(tool, {});
    expect(result).toContain("truncated");
    expect(result.length).toBeLessThan(largeDiff.length);
  });
});
