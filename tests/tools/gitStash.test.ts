import { describe, it, expect } from "vitest";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createGitStashTool } from "#tools/gitStash.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("gitStash tool", () => {
  it("pushes changes to stash", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "Saved working directory", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitStashTool(mockExec, "/project");
    const result = await exec(tool, { action: "push" });
    expect(result).toContain("Saved");
    expect(mockExec.executedCommands[0]).toBe("git stash push");
  });

  it("pushes with a message", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "Saved", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitStashTool(mockExec);
    await exec(tool, { action: "push", message: "WIP: feature" });
    expect(mockExec.executedCommands[0]).toContain("WIP: feature");
  });

  it("pops from stash", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "Restored changes", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitStashTool(mockExec);
    const result = await exec(tool, { action: "pop" });
    expect(result).toContain("Restored");
    expect(mockExec.executedCommands[0]).toBe("git stash pop");
  });

  it("lists stash entries", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "stash@{0}: WIP on main\nstash@{1}: WIP on feature", stderr: "", exitCode: 0 },
    ]);
    const tool = createGitStashTool(mockExec);
    const result = await exec(tool, { action: "list" });
    expect(result).toContain("stash@{0}");
    expect(result).toContain("stash@{1}");
  });
});
