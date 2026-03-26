import { describe, it, expect } from "vitest";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createGitLogTool } from "#tools/gitLog.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("gitLog tool", () => {
  it("returns oneline log by default", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "abc1234 Initial commit\ndef5678 Add feature", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitLogTool(mockExec, "/project");
    const result = await exec(tool, {});
    expect(result).toContain("abc1234");
    expect(result).toContain("def5678");
    expect(mockExec.executedCommands[0]).toContain("--oneline");
  });

  it("respects count parameter", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "commit", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitLogTool(mockExec);
    await exec(tool, { count: 5 });
    expect(mockExec.executedCommands[0]).toContain("-5");
  });

  it("filters by file path", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "commit for file", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitLogTool(mockExec);
    await exec(tool, { path: "src/index.ts" });
    expect(mockExec.executedCommands[0]).toContain("-- src/index.ts");
  });

  it("uses medium format when oneline is false", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "full commit details", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitLogTool(mockExec);
    await exec(tool, { oneline: false });
    expect(mockExec.executedCommands[0]).toContain("--format=medium");
  });
});
