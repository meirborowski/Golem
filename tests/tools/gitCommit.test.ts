import { describe, it, expect } from "vitest";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createGitCommitTool } from "#tools/gitCommit.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("gitCommit tool", () => {
  it("stages all and commits with message", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 }, // git add
      { stdout: "[main abc1234] Add feature\n 1 file changed", stderr: "", exitCode: 0 }, // git commit
    ]);
    const tool = createGitCommitTool(mockExec, "/project");
    const result = await exec(tool, { message: "Add feature" });
    expect(mockExec.executedCommands[0]).toBe("git add -A");
    expect(mockExec.executedCommands[1]).toBe("git commit -F -");
    expect(mockExec.executedOptions[1]?.stdin).toBe("Add feature");
    expect(result).toContain("abc1234");
  });

  it("stages specific files when provided", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "committed", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitCommitTool(mockExec);
    await exec(tool, { message: "Fix bug", files: ["src/a.ts", "src/b.ts"] });
    expect(mockExec.executedCommands[0]).toContain("src/a.ts");
    expect(mockExec.executedCommands[0]).toContain("src/b.ts");
  });

  it("reports staging errors", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "pathspec error", exitCode: 1 },
    ]);
    const tool = createGitCommitTool(mockExec);
    const result = await exec(tool, { message: "test" });
    expect(result).toContain("Error staging");
  });
});
