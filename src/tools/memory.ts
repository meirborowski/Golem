import { tool } from 'ai';
import { z } from 'zod';
import { memorySet, memoryGet, memoryDelete, memoryList, memoryClear } from '../core/memory.js';
import type { MemoryScope } from '../core/memory.js';

export const memory = (cwd: string) =>
  tool({
    description:
      'Persistent key-value memory that survives across sessions. Use "project" scope for project-specific context (stored in .golem/memory.json) and "global" scope for user preferences (stored in ~/.config/golem/memory.json). Store decisions, conventions, user preferences, or any context worth remembering.',
    parameters: z.object({
      action: z
        .enum(['set', 'get', 'delete', 'list', 'clear'])
        .describe('The action to perform'),
      key: z
        .union([z.string(), z.null()])
        .describe('Memory key (required for set, get, delete). Use descriptive names like "test-framework" or "preferred-style".'),
      value: z
        .union([z.string(), z.null()])
        .describe('Value to store (required for set).'),
      scope: z
        .union([z.enum(['global', 'project']), z.null()])
        .describe('Where to store. "project" (default) for project-specific, "global" for cross-project preferences.'),
    }),
    execute: async ({ action, key, value, scope: rawScope }) => {
      const scope: MemoryScope = rawScope ?? 'project';

      try {
        switch (action) {
          case 'set': {
            if (!key) return { success: false, error: 'Key is required for "set"' };
            if (!value) return { success: false, error: 'Value is required for "set"' };
            memorySet(key, value, scope, cwd);
            return {
              success: true,
              message: `Stored "${key}" in ${scope} memory`,
              key,
              value,
              scope,
            };
          }

          case 'get': {
            if (!key) return { success: false, error: 'Key is required for "get"' };
            const result = memoryGet(key, scope, cwd);
            if (result === null) {
              return { success: false, error: `Key "${key}" not found in ${scope} memory` };
            }
            return { success: true, key, value: result, scope };
          }

          case 'delete': {
            if (!key) return { success: false, error: 'Key is required for "delete"' };
            const deleted = memoryDelete(key, scope, cwd);
            if (!deleted) {
              return { success: false, error: `Key "${key}" not found in ${scope} memory` };
            }
            return { success: true, message: `Deleted "${key}" from ${scope} memory`, scope };
          }

          case 'list': {
            const entries = memoryList(scope, cwd);
            const keys = Object.keys(entries);
            if (keys.length === 0) {
              return { success: true, message: `No entries in ${scope} memory`, entries: {}, count: 0, scope };
            }
            return {
              success: true,
              entries,
              count: keys.length,
              scope,
            };
          }

          case 'clear': {
            const count = memoryClear(scope, cwd);
            return {
              success: true,
              message: `Cleared ${count} entries from ${scope} memory`,
              scope,
            };
          }

          default:
            return { success: false, error: `Unknown action: ${action as string}` };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
