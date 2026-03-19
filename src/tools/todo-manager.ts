import { tool } from 'ai';
import { z } from 'zod';

interface TodoItem {
  id: number;
  task: string;
  status: 'pending' | 'in-progress' | 'done';
  createdAt: number;
}

/**
 * In-memory todo list scoped to the session.
 * Each cwd gets its own list so concurrent sessions don't interfere.
 */
const todoLists = new Map<string, TodoItem[]>();
let nextId = 1;

function getList(cwd: string): TodoItem[] {
  if (!todoLists.has(cwd)) {
    todoLists.set(cwd, []);
  }
  return todoLists.get(cwd)!;
}

function formatList(items: TodoItem[]): string {
  if (items.length === 0) return 'No tasks.';

  const statusIcon = { pending: '○', 'in-progress': '◑', done: '●' };

  return items
    .map((item) => `${statusIcon[item.status]} [${item.id}] ${item.task} (${item.status})`)
    .join('\n');
}

export const todoManager = (cwd: string) =>
  tool({
    description:
      'Manage an in-session task list to track progress on multi-step work. Use this to break down complex tasks, track what has been done, and plan next steps. The list persists for the session only.',
    parameters: z.object({
      action: z
        .enum(['add', 'update', 'remove', 'list', 'clear'])
        .describe('The action to perform on the todo list'),
      task: z
        .union([z.string(), z.null()])
        .describe('Task description (required for "add")'),
      id: z
        .union([z.number(), z.null()])
        .describe('Task ID (required for "update" and "remove")'),
      status: z
        .union([z.enum(['pending', 'in-progress', 'done']), z.null()])
        .describe('New status (for "update"). Null keeps current status.'),
    }),
    execute: async ({ action, task, id, status }) => {
      const list = getList(cwd);

      switch (action) {
        case 'add': {
          if (!task) {
            return { success: false, error: 'Task description is required for "add"' };
          }
          const item: TodoItem = {
            id: nextId++,
            task,
            status: 'pending',
            createdAt: Date.now(),
          };
          list.push(item);
          return {
            success: true,
            message: `Added task #${item.id}: ${item.task}`,
            tasks: formatList(list),
          };
        }

        case 'update': {
          if (id === null || id === undefined) {
            return { success: false, error: 'Task ID is required for "update"' };
          }
          const item = list.find((t) => t.id === id);
          if (!item) {
            return { success: false, error: `Task #${id} not found` };
          }
          if (task) item.task = task;
          if (status) item.status = status;
          return {
            success: true,
            message: `Updated task #${id}`,
            tasks: formatList(list),
          };
        }

        case 'remove': {
          if (id === null || id === undefined) {
            return { success: false, error: 'Task ID is required for "remove"' };
          }
          const idx = list.findIndex((t) => t.id === id);
          if (idx === -1) {
            return { success: false, error: `Task #${id} not found` };
          }
          const removed = list.splice(idx, 1)[0];
          return {
            success: true,
            message: `Removed task #${removed.id}: ${removed.task}`,
            tasks: formatList(list),
          };
        }

        case 'list': {
          return {
            success: true,
            total: list.length,
            pending: list.filter((t) => t.status === 'pending').length,
            inProgress: list.filter((t) => t.status === 'in-progress').length,
            done: list.filter((t) => t.status === 'done').length,
            tasks: formatList(list),
          };
        }

        case 'clear': {
          const count = list.length;
          list.length = 0;
          return {
            success: true,
            message: `Cleared ${count} tasks`,
            tasks: formatList(list),
          };
        }

        default:
          return { success: false, error: `Unknown action: ${action as string}` };
      }
    },
  });
