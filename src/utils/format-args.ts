/**
 * Format tool call arguments into a concise preview string.
 * Used by both ToolCallDisplay and agent progress indicator.
 */
export function formatArgs(args: unknown): string {
  if (typeof args !== 'object' || args === null) return String(args);
  const obj = args as Record<string, unknown>;

  // Show key arguments concisely
  const parts: string[] = [];
  if ('filePath' in obj) parts.push(String(obj['filePath']));
  if ('pattern' in obj) parts.push(`"${String(obj['pattern'])}"`);
  if ('command' in obj) parts.push(`$ ${String(obj['command'])}`);
  if ('glob' in obj) parts.push(String(obj['glob']));
  if ('path' in obj && !('filePath' in obj)) parts.push(String(obj['path']));
  if ('query' in obj) parts.push(`"${String(obj['query'])}"`);
  if ('thought' in obj) {
    const t = String(obj['thought']);
    parts.push(t.length > 40 ? t.slice(0, 40) + '…' : t);
  }
  if ('summary' in obj) {
    const s = String(obj['summary']);
    parts.push(s.length > 40 ? s.slice(0, 40) + '…' : s);
  }

  return parts.length > 0 ? parts.join(', ') : JSON.stringify(args).slice(0, 80);
}
