import { describe, it, expect } from "vitest";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createGitShowTool } from "#tools/gitShow.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("gitShow tool", () => {
  it("returns commit details", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "commit abc1234\nAuthor: Test\nDate: 2024-01-01\n\n  fix bug", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitShowTool(mockExec, "/project");

    const result = await exec(tool, { commit: "abc1234" });
    expect(result).toContain("commit abc1234");
    expect(result).toContain("fix bug");
  });

  it("passes --stat flag when stat is true", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "commit abc\n file.ts | 2 +-", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitShowTool(mockExec, "/project");

    await exec(tool, { commit: "abc", stat: true });
    expect(mockExec.executedCommands[0]).toContain("--stat");
  });

  it("returns error on failure", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "fatal: bad object", exitCode: 128 },
    ]);
    const tool = createGitShowTool(mockExec, "/project");

    const result = await exec(tool, { commit: "badref" });
    expect(result).toContain("Error");
    expect(result).toContain("bad object");
  });

  it("returns no-output message for empty stdout", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitShowTool(mockExec, "/project");

    const result = await exec(tool, { commit: "abc" });
    expect(result).toContain("No output");
  });
});
