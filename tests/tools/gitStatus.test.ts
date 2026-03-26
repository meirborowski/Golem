import { describe, it, expect } from "vitest";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createGitStatusTool } from "#tools/gitStatus.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("gitStatus tool", () => {
  it("returns short status output", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: " M src/index.ts\n?? new-file.ts\n", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitStatusTool(mockExec, "/project");
    const result = await exec(tool, {});
    expect(result).toContain("M src/index.ts");
    expect(result).toContain("?? new-file.ts");
  });

  it("reports clean working tree", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitStatusTool(mockExec);
    const result = await exec(tool, {});
    expect(result).toContain("clean");
  });

  it("reports git errors", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "fatal: not a git repository", exitCode: 128 },
    ]);
    const tool = createGitStatusTool(mockExec);
    const result = await exec(tool, {});
    expect(result).toContain("not a git repository");
  });
});
