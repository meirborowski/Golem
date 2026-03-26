import { describe, it, expect } from "vitest";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createGitBranchTool } from "#tools/gitBranch.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("gitBranch tool", () => {
  it("lists branches", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "* main\n  feature/new\n  remotes/origin/main", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitBranchTool(mockExec, "/project");
    const result = await exec(tool, { action: "list" });
    expect(result).toContain("main");
    expect(result).toContain("feature/new");
    expect(mockExec.executedCommands[0]).toContain("git branch -a");
  });

  it("creates a new branch", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "Switched to a new branch 'feature/test'", exitCode: 0 },
    ]);
    const tool = createGitBranchTool(mockExec);
    const result = await exec(tool, { action: "create", name: "feature/test" });
    expect(mockExec.executedCommands[0]).toContain("checkout -b");
    expect(result).toContain("feature/test");
  });

  it("switches to an existing branch", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "Switched to branch 'main'", exitCode: 0 },
    ]);
    const tool = createGitBranchTool(mockExec);
    const result = await exec(tool, { action: "switch", name: "main" });
    expect(mockExec.executedCommands[0]).toContain('git checkout "main"');
  });

  it("errors when name is missing for create", async () => {
    const mockExec = new MockExecutionEnvironment();
    const tool = createGitBranchTool(mockExec);
    const result = await exec(tool, { action: "create" });
    expect(result).toContain("Branch name is required");
  });
});
