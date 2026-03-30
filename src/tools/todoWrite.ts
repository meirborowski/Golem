import { tool } from "ai";
import { z } from "zod";
import type { IUserInterface } from "#core/interfaces/IUserInterface.js";
import type { AgentContext } from "#core/entities/AgentContext.js";
import type { TodoItem } from "#core/entities/TodoItem.js";

export function createTodoWriteTool(context: AgentContext, ui: IUserInterface) {
  return tool({
    description:
      "Create or update a task list to track progress on multi-step work. " +
      "Each call replaces the entire todo list. Use this to break complex tasks " +
      "into steps, mark steps as in_progress when starting them, and completed when done. " +
      "Keep exactly one item as in_progress at a time.",
    inputSchema: z.object({
      todos: z.array(
        z.object({
          content: z.string().describe("Task description"),
          status: z
            .enum(["pending", "in_progress", "completed"])
            .describe("pending = not started, in_progress = working on it, completed = done"),
        }),
      ),
    }),
    execute: async ({ todos }) => {
      const items: TodoItem[] = todos.map((t) => ({
        content: t.content,
        status: t.status,
      }));

      context.metadata.todos = items;
      ui.updateTodos(items);

      const counts = {
        completed: items.filter((t) => t.status === "completed").length,
        in_progress: items.filter((t) => t.status === "in_progress").length,
        pending: items.filter((t) => t.status === "pending").length,
      };

      return `Updated todos: ${counts.completed} completed, ${counts.in_progress} in progress, ${counts.pending} pending`;
    },
  });
}
