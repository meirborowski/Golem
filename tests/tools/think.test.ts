import { describe, it, expect } from "vitest";
import { createThinkTool } from "#tools/think.js";

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("think tool", () => {
  it("returns the exact input thought", async () => {
    const tool = createThinkTool();
    const result = await exec(tool, { thought: "I should check the imports first." });
    expect(result).toBe("I should check the imports first.");
  });

  it("handles empty string", async () => {
    const tool = createThinkTool();
    const result = await exec(tool, { thought: "" });
    expect(result).toBe("");
  });

  it("handles multiline input", async () => {
    const tool = createThinkTool();
    const thought = "Step 1: Read the file\nStep 2: Find the bug\nStep 3: Fix it";
    const result = await exec(tool, { thought });
    expect(result).toBe(thought);
  });
});
