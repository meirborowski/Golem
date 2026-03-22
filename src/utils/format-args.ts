/**
 * Format tool call arguments into a concise preview string.
 * Used by both ToolCallDisplay and agent progress indicator.
 */
export function formatArgs(args: unknown): string {
  if (typeof args !== 'object' || args === null) return String(args);
  const obj = args as Record<string, unknown>;

  // Show key arguments concisely
  const parts: string[] = [];
  if ('subcommand' in obj) {
    // Git tool: show "subcommand args"
    const sub = String(obj['subcommand']);
    const gitArgs = typeof obj['args'] === 'string' ? ` ${obj['args']}` : '';
    parts.push(`${sub}${gitArgs}`);
  } else if ('filePath' in obj) {
    parts.push(String(obj['filePath']));
  } else if ('command' in obj) {
    parts.push(`$ ${String(obj['command'])}`);
  } else if ('pattern' in obj) {
    parts.push(`"${String(obj['pattern'])}"`);
  } else if ('glob' in obj) {
    parts.push(String(obj['glob']));
  } else if ('path' in obj) {
    parts.push(String(obj['path']));
  } else if ('query' in obj) {
    parts.push(`"${String(obj['query'])}"`);
  }
  if ('thought' in obj) {
    const t = String(obj['thought']);
    parts.push(t.length > 40 ? t.slice(0, 40) + '…' : t);
  }
  if ('summary' in obj) {
    const s = String(obj['summary']);
    parts.push(s.length > 40 ? s.slice(0, 40) + '…' : s);
  }
  // Show extra context fields not already handled
  if ('content' in obj && parts.length === 0) {
    const c = String(obj['content']);
    parts.push(c.length > 40 ? c.slice(0, 40) + '…' : c);
  }
  if ('url' in obj) {
    parts.push(String(obj['url']));
  }

  return parts.length > 0 ? parts.join(', ') : JSON.stringify(args).slice(0, 80);
}
