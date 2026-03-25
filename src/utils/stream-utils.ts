const MAX_RESULT_CHARS = 200;

/** Shrink a tool result to avoid holding large file contents in memory. */
export function summarizeToolResult(result: unknown): unknown {
  if (result == null) return result;
  const str = typeof result === 'string' ? result : JSON.stringify(result);
  if (str.length <= MAX_RESULT_CHARS) return result;
  return typeof result === 'string'
    ? str.slice(0, MAX_RESULT_CHARS) + '… (truncated)'
    : { _summary: str.slice(0, MAX_RESULT_CHARS) + '… (truncated)' };
}

/** Check if a tool result indicates failure (tools return { success: false, error: ... }). */
export function isToolError(result: unknown): boolean {
  if (result == null || typeof result !== 'object') return false;
  return (result as Record<string, unknown>)['success'] === false;
}
