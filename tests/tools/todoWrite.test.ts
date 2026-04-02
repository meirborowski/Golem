import { describe, it, expect, vi } from "vitest";
import { createTodoWriteTool } from "#tools/todoWrite.js";
import { MockUserInterface } from "../mocks/MockUserInterface.js";
import type { AgentContext } from "#core/entities/AgentContext.js";

function createContext(): AgentContext {
  return {
    messages: [],
    currentRequest: "test",
    workingDirectory: "/project",
    gatheredFiles: new Map(),
    pendingChanges: [],
    shouldContinue: true,
    metadata: {},
  };
}

const exec = (tool: any, args: any) => tool.execute(args, { toolCallId: "test", messages: [] });

describe("todoWrite tool", () => {
  it("sets context.metadata.todos", async () => {
    const ctx = createContext();
    const ui = new MockUserInterface();
    const tool = createTodoWriteTool(ctx, ui);

    await exec(tool, {
      todos: [
        { content: "Read file", status: "completed" },
        { content: "Fix bug", status: "in_progress" },
        { content: "Run tests", status: "pending" },
      ],
    });

    const todos = ctx.metadata.todos as any[];
    expect(todos).toHaveLength(3);
    expect(todos[0].content).toBe("Read file");
    expect(todos[1].status).toBe("in_progress");
  });

  it("calls ui.updateTodos", async () => {
    const ctx = createContext();
    const ui = new MockUserInterface();
    const spy = vi.spyOn(ui, "updateTodos");
    const tool = createTodoWriteTool(ctx, ui);

    await exec(tool, {
      todos: [{ content: "Task 1", status: "pending" }],
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("returns summary with correct counts", async () => {
    const ctx = createContext();
    const ui = new MockUserInterface();
    const tool = createTodoWriteTool(ctx, ui);

    const result = await exec(tool, {
      todos: [
        { content: "A", status: "completed" },
        { content: "B", status: "completed" },
        { content: "C", status: "in_progress" },
        { content: "D", status: "pending" },
      ],
    });

    expect(result).toContain("2 completed");
    expect(result).toContain("1 in progress");
    expect(result).toContain("1 pending");
  });

  it("replaces entire list on subsequent calls", async () => {
    const ctx = createContext();
    const ui = new MockUserInterface();
    const tool = createTodoWriteTool(ctx, ui);

    await exec(tool, { todos: [{ content: "Old", status: "pending" }] });
    await exec(tool, { todos: [{ content: "New", status: "completed" }] });

    const todos = ctx.metadata.todos as any[];
    expect(todos).toHaveLength(1);
    expect(todos[0].content).toBe("New");
  });

  it("handles empty array", async () => {
    const ctx = createContext();
    const ui = new MockUserInterface();
    const tool = createTodoWriteTool(ctx, ui);

    const result = await exec(tool, { todos: [] });
    expect(result).toContain("0 completed");
    expect(result).toContain("0 in progress");
    expect(result).toContain("0 pending");
  });
});
