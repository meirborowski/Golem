import type { IDebugLogger } from "#core/interfaces/IDebugLogger.js";

/**
 * Wraps a tools record so that every tool's execute() is intercepted
 * with debug logging. The original tools are not modified.
 * Business logic remains completely unaware of debug mode.
 */
export function wrapToolsWithLogging<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends Record<string, { execute?: (...args: any[]) => any }>,
>(tools: T, logger: IDebugLogger): T {
  if (!logger.isEnabled()) return tools;

  const wrapped = {} as Record<string, unknown>;

  for (const [name, toolDef] of Object.entries(tools)) {
    if (typeof toolDef.execute !== "function") {
      wrapped[name] = toolDef;
      continue;
    }

    const originalExecute = toolDef.execute;
    wrapped[name] = {
      ...toolDef,
      execute: async (...args: unknown[]) => {
        const start = Date.now();
        logger.log("tool", "execute-start", {
          tool: name,
          input: args[0] as Record<string, unknown>,
        });

        try {
          const result = await originalExecute(...args);
          logger.log("tool", "execute-end", {
            tool: name,
            durationMs: Date.now() - start,
            outputPreview:
              typeof result === "string"
                ? result.slice(0, 500)
                : JSON.stringify(result).slice(0, 500),
          });
          return result;
        } catch (e) {
          logger.log("tool", "execute-error", {
            tool: name,
            durationMs: Date.now() - start,
            error: e instanceof Error ? e.message : String(e),
          });
          throw e;
        }
      },
    };
  }

  return wrapped as T;
}
