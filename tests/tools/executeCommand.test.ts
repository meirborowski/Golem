import { describe, it, expect } from "vitest";
import { MockExecutionEnvironment } from "../mocks/MockExecutionEnvironment.js";
import { createExecuteCommandTool } from "#tools/executeCommand.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("executeCommand tool", () => {
  it("runs command and returns formatted output", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "hello\n", stderr: "", exitCode: 0 },
    ]);
    const tool = createExecuteCommandTool(mockExec, "/project");

    const result = await exec(tool, { command: "echo hello" });
    expect(result).toContain("Exit code: 0");
    expect(result).toContain("Stdout: hello");
    expect(mockExec.executedCommands).toEqual(["echo hello"]);
  });

  it("captures stderr and non-zero exit code", async () => {
    const mockExec = new MockExecutionEnvironment([
      { stdout: "", stderr: "command not found", exitCode: 127 },
    ]);
    const tool = createExecuteCommandTool(mockExec);

    const result = await exec(tool, { command: "nonexistent" });
    expect(result).toContain("Exit code: 127");
    expect(result).toContain("Stderr: command not found");
  });

  it("handles exception from exec.execute", async () => {
    const mockExec = {
      async execute() { throw new Error("spawn failed"); },
    };
    const tool = createExecuteCommandTool(mockExec as any);

    const result = await exec(tool, { command: "bad" });
    expect(result).toContain("Error executing command");
    expect(result).toContain("spawn failed");
  });
});
