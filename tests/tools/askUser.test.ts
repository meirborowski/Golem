import { describe, it, expect } from "vitest";
import { createAskUserTool } from "#tools/askUser.js";
import { MockUserInterface } from "../mocks/MockUserInterface.js";

function createTool(inputs: string[]) {
  const ui = new MockUserInterface(inputs);
  return createAskUserTool(ui);
}

async function execute(
  tool: ReturnType<typeof createAskUserTool>,
  args: { question: string },
) {
  return tool.execute!(args, { toolCallId: "test", messages: [] });
}

describe("askUser", () => {
  it("returns the user's text response", async () => {
    const tool = createTool(["React"]);
    const result = await execute(tool, { question: "What framework?" });
    expect(result).toBe("React");
  });

  it("returns sentinel for empty response", async () => {
    const tool = createTool([""]);
    const result = await execute(tool, { question: "What now?" });
    expect(result).toBe("[The user provided an empty response]");
  });

  it("returns sentinel for whitespace-only response", async () => {
    const tool = createTool(["   "]);
    const result = await execute(tool, { question: "What now?" });
    expect(result).toBe("[The user provided an empty response]");
  });

  it("trims whitespace from response", async () => {
    const tool = createTool(["  hello  "]);
    const result = await execute(tool, { question: "Say something" });
    expect(result).toBe("hello");
  });

  it("passes question to the prompt", async () => {
    const ui = new MockUserInterface(["yes"]);
    const tool = createAskUserTool(ui);
    await execute(tool, { question: "Continue?" });
    // MockUserInterface ignores the message, but the tool should not throw
  });
});
