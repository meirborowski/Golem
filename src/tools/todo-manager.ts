import { tool } from 'ai';
import { z } from 'zod';

interface TodoItem {
  id: number;
  task: string;
  status: 'pending' | 'in-progress' | 'done';
  dependsOn: number[];
  priority: number;
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

/**
 * Detect cycles in the dependency graph using DFS.
 */
function detectCycle(items: { id: number; dependsOn: number[] }[]): boolean {
  const idSet = new Set(items.map((i) => i.id));
  const adj = new Map<number, number[]>();
  for (const item of items) {
    adj.set(item.id, item.dependsOn.filter((d) => idSet.has(d)));
  }

  const visited = new Set<number>();
  const inStack = new Set<number>();

  function dfs(node: number): boolean {
    visited.add(node);
    inStack.add(node);
    for (const dep of adj.get(node) ?? []) {
      if (!visited.has(dep)) {
        if (dfs(dep)) return true;
      } else if (inStack.has(dep)) {
        return true;
      }
    }
    inStack.delete(node);
    return false;
  }

  for (const item of items) {
    if (!visited.has(item.id)) {
      if (dfs(item.id)) return true;
    }
  }
  return false;
}

/**
 * Get IDs of incomplete dependencies for a task.
 */
function getBlockedBy(item: TodoItem, list: TodoItem[]): number[] {
  if (item.dependsOn.length === 0) return [];
  const doneIds = new Set(list.filter((t) => t.status === 'done').map((t) => t.id));
  return item.dependsOn.filter((depId) => !doneIds.has(depId));
}

/**
 * Return tasks in topological order (dependencies first).
 * Falls back to priority then creation order for independent tasks.
 */
function topologicalOrder(items: TodoItem[]): TodoItem[] {
  const idMap = new Map(items.map((i) => [i.id, i]));
  const inDegree = new Map<number, number>();
  const adj = new Map<number, number[]>();

  for (const item of items) {
    inDegree.set(item.id, 0);
    adj.set(item.id, []);
  }

  for (const item of items) {
    for (const dep of item.dependsOn) {
      if (idMap.has(dep)) {
        adj.get(dep)!.push(item.id);
        inDegree.set(item.id, (inDegree.get(item.id) ?? 0) + 1);
      }
    }
  }

  // Use a priority-aware queue (sort by priority then id)
  const queue: TodoItem[] = [];
  for (const item of items) {
    if (inDegree.get(item.id) === 0) {
      queue.push(item);
    }
  }
  queue.sort((a, b) => a.priority - b.priority || a.id - b.id);

  const result: TodoItem[] = [];
  while (queue.length > 0) {
    const item = queue.shift()!;
    result.push(item);
    for (const next of adj.get(item.id) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) {
        queue.push(idMap.get(next)!);
        queue.sort((a, b) => a.priority - b.priority || a.id - b.id);
      }
    }
  }

  return result;
}

const statusIcon = { pending: '○', 'in-progress': '◑', done: '●' };

function formatList(items: TodoItem[], list: TodoItem[]): string {
  if (items.length === 0) return 'No tasks.';

  return items
    .map((item) => {
      const blocked = getBlockedBy(item, list);
      const icon = statusIcon[item.status];
      const blockedLabel = blocked.length > 0 ? ` [blocked by #${blocked.join(', #')}]` : '';
      const depsLabel = item.dependsOn.length > 0 ? ` (depends on #${item.dependsOn.join(', #')})` : '';
      return `${icon} [${item.id}] ${item.task} (${item.status})${depsLabel}${blockedLabel}`;
    })
    .join('\n');
}

function toItemsSummary(items: TodoItem[], list: TodoItem[]) {
  return items.map((item) => ({
    id: item.id,
    task: item.task,
    status: item.status,
    dependsOn: item.dependsOn.length > 0 ? item.dependsOn : undefined,
    blockedBy: getBlockedBy(item, list).length > 0 ? getBlockedBy(item, list) : undefined,
  }));
}

export const todoManager = (cwd: string) =>
  Object.assign(
    tool({
      description:
        'Plan and track multi-step work with dependency-aware task management. ALWAYS use this before starting non-trivial tasks. Actions: "plan" creates a structured breakdown with dependency ordering (use first), "next" returns the next unblocked step to work on, "update" marks progress (blocks starting tasks with incomplete dependencies), "add"/"remove"/"list"/"clear" for individual task management.',
      inputSchema: z.object({
        action: z
          .enum(['add', 'update', 'remove', 'list', 'clear', 'plan', 'next'])
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
        dependsOn: z
          .union([z.array(z.number()), z.null()])
          .describe('IDs of tasks this task depends on (for "add" or "update"). Null means no dependencies.'),
        priority: z
          .union([z.number(), z.null()])
          .describe('Priority for ordering (lower = higher priority, default 0). Used by "next" to pick among ready tasks.'),
        steps: z
          .union([
            z.array(
              z.object({
                task: z.string().describe('Step description'),
                dependsOn: z
                  .union([z.array(z.number()), z.null()])
                  .describe('Step indices (0-based) this step depends on. Null = no dependencies.'),
                priority: z
                  .union([z.number(), z.null()])
                  .describe('Priority (lower = higher). Null defaults to 0.'),
              }),
            ),
            z.null(),
          ])
          .describe('Array of steps for "plan" action. Each step can reference other steps by 0-based index in the dependsOn array.'),
      }),
      execute: async ({ action, task, id, status, dependsOn, priority, steps }) => {
      const list = getList(cwd);

      switch (action) {
        case 'add': {
          if (!task) {
            return { success: false, error: 'Task description is required for "add"' };
          }
          const deps = dependsOn ?? [];
          // Validate dependency IDs exist
          for (const depId of deps) {
            if (!list.find((t) => t.id === depId)) {
              return { success: false, error: `Dependency #${depId} not found` };
            }
          }
          const item: TodoItem = {
            id: nextId++,
            task,
            status: 'pending',
            dependsOn: deps,
            priority: priority ?? 0,
            createdAt: Date.now(),
          };
          list.push(item);
          // Check for cycles after adding
          if (detectCycle(list)) {
            list.pop();
            nextId--;
            return { success: false, error: 'Adding this task would create a circular dependency' };
          }
          const ordered = topologicalOrder(list);
          return {
            success: true,
            message: `Added task #${item.id}: ${item.task}`,
            tasks: formatList(ordered, list),
            items: toItemsSummary(ordered, list),
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
          // Check if trying to start a blocked task
          if (status === 'in-progress') {
            const blocked = getBlockedBy(item, list);
            if (blocked.length > 0) {
              return {
                success: false,
                error: `Task #${id} is blocked by incomplete dependencies: #${blocked.join(', #')}`,
              };
            }
          }
          if (task) item.task = task;
          if (status) item.status = status;
          if (dependsOn !== null && dependsOn !== undefined) {
            // Validate dependency IDs exist
            for (const depId of dependsOn) {
              if (!list.find((t) => t.id === depId)) {
                return { success: false, error: `Dependency #${depId} not found` };
              }
            }
            const oldDeps = item.dependsOn;
            item.dependsOn = dependsOn;
            if (detectCycle(list)) {
              item.dependsOn = oldDeps;
              return { success: false, error: 'This dependency change would create a circular dependency' };
            }
          }
          if (priority !== null && priority !== undefined) {
            item.priority = priority;
          }
          const ordered = topologicalOrder(list);
          return {
            success: true,
            message: `Updated task #${id}`,
            tasks: formatList(ordered, list),
            items: toItemsSummary(ordered, list),
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
          // Check if other tasks depend on this one
          const dependents = list.filter((t) => t.dependsOn.includes(id!));
          if (dependents.length > 0) {
            // Remove the dependency reference from dependents
            for (const dep of dependents) {
              dep.dependsOn = dep.dependsOn.filter((d) => d !== id);
            }
          }
          const removed = list.splice(idx, 1)[0];
          const ordered = topologicalOrder(list);
          return {
            success: true,
            message: `Removed task #${removed.id}: ${removed.task}`,
            tasks: formatList(ordered, list),
            items: toItemsSummary(ordered, list),
          };
        }

        case 'list': {
          const ordered = topologicalOrder(list);
          return {
            success: true,
            total: list.length,
            pending: list.filter((t) => t.status === 'pending').length,
            inProgress: list.filter((t) => t.status === 'in-progress').length,
            done: list.filter((t) => t.status === 'done').length,
            tasks: formatList(ordered, list),
            items: toItemsSummary(ordered, list),
          };
        }

        case 'clear': {
          const count = list.length;
          list.length = 0;
          return {
            success: true,
            message: `Cleared ${count} tasks`,
            tasks: formatList(list, list),
            items: toItemsSummary(list, list),
          };
        }

        case 'plan': {
          if (!steps || steps.length === 0) {
            return { success: false, error: 'Steps array is required for "plan" action' };
          }

          // Clear existing list
          list.length = 0;

          // Assign IDs and convert index-based deps to ID-based deps
          const startId = nextId;
          const newItems: TodoItem[] = steps.map((step, index) => {
            const itemId = startId + index;
            const deps = (step.dependsOn ?? []).map((depIndex) => {
              if (depIndex < 0 || depIndex >= steps.length) {
                return -1; // Will be caught in validation
              }
              return startId + depIndex;
            });
            return {
              id: itemId,
              task: step.task,
              status: 'pending' as const,
              dependsOn: deps,
              priority: step.priority ?? 0,
              createdAt: Date.now(),
            };
          });

          // Validate all dependency indices were valid
          for (const item of newItems) {
            if (item.dependsOn.includes(-1)) {
              return { success: false, error: 'Invalid step index in dependsOn. Use 0-based indices.' };
            }
          }

          // Check for cycles
          if (detectCycle(newItems)) {
            return { success: false, error: 'Plan contains circular dependencies' };
          }

          // Commit the plan
          list.push(...newItems);
          nextId = startId + steps.length;

          const ordered = topologicalOrder(list);
          return {
            success: true,
            message: `Created plan with ${steps.length} steps`,
            tasks: formatList(ordered, list),
            items: toItemsSummary(ordered, list),
          };
        }

        case 'next': {
          const doneIds = new Set(list.filter((t) => t.status === 'done').map((t) => t.id));
          const ready = list
            .filter((t) => t.status === 'pending' && t.dependsOn.every((d) => doneIds.has(d)))
            .sort((a, b) => a.priority - b.priority || a.id - b.id);

          if (ready.length === 0) {
            const remaining = list.filter((t) => t.status !== 'done');
            if (remaining.length === 0) {
              return { success: true, message: 'All tasks completed!', nextTask: null, items: toItemsSummary(topologicalOrder(list), list) };
            }
            const inProgress = list.filter((t) => t.status === 'in-progress');
            if (inProgress.length > 0) {
              return {
                success: true,
                message: `No ready tasks. ${inProgress.length} task(s) in progress.`,
                nextTask: null,
                inProgress: inProgress.map((t) => ({ id: t.id, task: t.task })),
                items: toItemsSummary(topologicalOrder(list), list),
              };
            }
            return {
              success: true,
              message: 'All remaining tasks are blocked by incomplete dependencies.',
              nextTask: null,
              blocked: remaining.map((t) => ({ id: t.id, task: t.task, blockedBy: getBlockedBy(t, list) })),
              items: toItemsSummary(topologicalOrder(list), list),
            };
          }

          const next = ready[0];
          return {
            success: true,
            nextTask: { id: next.id, task: next.task, priority: next.priority },
            readyCount: ready.length,
            items: toItemsSummary(topologicalOrder(list), list),
          };
        }

        default:
          return { success: false, error: `Unknown action: ${action as string}` };
      }
    },
    }),
    { whenToUse: 'ALWAYS use this tool at the start of any non-trivial task. Before writing code or making changes, create a plan with "plan" to break the work into steps with dependencies. Use "next" to pick the next step, "update" to mark progress. This ensures systematic execution, prevents missed steps, and gives the user visibility into your progress. Even for seemingly simple tasks that touch 2+ files, create a plan first.' },
  );
