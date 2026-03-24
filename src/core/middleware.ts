import type { ResolvedConfig } from './types.js';
import type { ToolSet } from './tool-registry.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ToolContext {
  toolName: string;
  toolCallId: string;
  args: unknown;
  rawContext: unknown;
  config: ResolvedConfig;
}

/** Call the next middleware (or the original tool execute). */
export type NextFn = () => Promise<unknown>;

/**
 * A middleware that wraps tool execution.
 *
 * - Call `next()` to proceed to the next middleware / original execute.
 * - Return without calling `next()` to short-circuit (e.g., deny).
 * - Mutate `ctx.args` before `next()` to transform inputs.
 * - Wrap the return value of `next()` to transform outputs.
 */
export type ToolMiddleware = (ctx: ToolContext, next: NextFn) => Promise<unknown>;

// ── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Wrap a tool's `execute` with a middleware chain.
 *
 * Execution order: `middlewares[0]` → `middlewares[1]` → … → `originalExecute`.
 * If the middleware array is empty the tool is returned unchanged.
 */
export function applyMiddleware(
  tool: ToolSet[string],
  toolName: string,
  config: ResolvedConfig,
  middlewares: ToolMiddleware[],
): ToolSet[string] {
  if (middlewares.length === 0) return tool;

  const originalExecute = tool.execute as (args: unknown, context: unknown) => Promise<unknown>;

  return {
    ...tool,
    execute: async (args: unknown, context: unknown) => {
      const rawCtx = context as { toolCallId?: string } | undefined;
      const toolCallId = rawCtx?.toolCallId ?? `${toolName}-${Date.now()}`;

      const ctx: ToolContext = {
        toolName,
        toolCallId,
        args,
        rawContext: context,
        config,
      };

      // Build the chain from right to left so middlewares[0] runs first.
      let next: NextFn = () => originalExecute(ctx.args, ctx.rawContext);

      for (let i = middlewares.length - 1; i >= 0; i--) {
        const mw = middlewares[i];
        const prevNext = next;
        next = () => mw(ctx, prevNext);
      }

      return next();
    },
  };
}
