import { describe, it, expect } from "vitest";
import { createAskUserChoiceTool } from "#tools/askUserChoice.js";
import { MockUserInterface } from "../mocks/MockUserInterface.js";

function createTool(inputs: string[]) {
  const ui = new MockUserInterface(inputs);
  return createAskUserChoiceTool(ui);
}

async function execute(
  tool: ReturnType<typeof createAskUserChoiceTool>,
  args: { question: string; options: string[] },
) {
  return tool.execute!(args, { toolCallId: "test", messages: [] });
}

describe("askUserChoice", () => {
  it("resolves numbered input to option text", async () => {
    const tool = createTool(["2"]);
    const result = await execute(tool, {
      question: "Pick a language",
      options: ["TypeScript", "Python", "Go"],
    });
    expect(result).toBe("Python");
  });

  it("resolves first option", async () => {
    const tool = createTool(["1"]);
    const result = await execute(tool, {
      question: "Pick one",
      options: ["A", "B"],
    });
    expect(result).toBe("A");
  });

  it("resolves last option", async () => {
    const tool = createTool(["3"]);
    const result = await execute(tool, {
      question: "Pick one",
      options: ["A", "B", "C"],
    });
    expect(result).toBe("C");
  });

  it("returns free-form text when input is not a number", async () => {
    const tool = createTool(["Rust"]);
    const result = await execute(tool, {
      question: "Pick a language",
      options: ["TypeScript", "Python", "Go"],
    });
    expect(result).toBe("Rust");
  });

  it("returns free-form text when number is out of range", async () => {
    const tool = createTool(["5"]);
    const result = await execute(tool, {
      question: "Pick one",
      options: ["A", "B"],
    });
    expect(result).toBe("5");
  });

  it("returns sentinel for empty response", async () => {
    const tool = createTool([""]);
    const result = await execute(tool, {
      question: "Pick one",
      options: ["A", "B"],
    });
    expect(result).toBe("[The user provided an empty response]");
  });

  it("trims whitespace from response", async () => {
    const tool = createTool(["  2  "]);
    const result = await execute(tool, {
      question: "Pick one",
      options: ["A", "B"],
    });
    expect(result).toBe("B");
  });
});
