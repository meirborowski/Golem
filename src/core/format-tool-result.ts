const MAX_PREVIEW_LEN = 120;

export function truncatePreview(str: string, max: number = MAX_PREVIEW_LEN): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

export function getResultPreview(result: unknown, status: string): string | null {
  if (result == null) {
    if (status === 'completed') return 'Done';
    if (status === 'error') return 'Failed';
    return null;
  }

  // Handle string results directly
  if (typeof result === 'string') {
    return truncatePreview(result);
  }

  if (typeof result !== 'object' || result === null) {
    return truncatePreview(String(result));
  }

  const obj = result as Record<string, unknown>;

  // Handle error results — extract the error message
  if (status === 'error' || obj['success'] === false) {
    if (typeof obj['error'] === 'string') {
      return truncatePreview(obj['error']);
    }
    return 'Failed';
  }

  // Handle truncated results from summarizeToolResult ({ _summary: "..." })
  if (typeof obj['_summary'] === 'string') {
    return 'Done';
  }

  // Handle success results — extract meaningful fields
  if (obj['success'] === true) {
    // Show stdout if present (git, bash results)
    if (typeof obj['stdout'] === 'string' && obj['stdout']) {
      return truncatePreview(obj['stdout']);
    }
    // Show filePath if present (readFile, writeFile results)
    if (typeof obj['filePath'] === 'string') {
      return truncatePreview(obj['filePath']);
    }
    // Show result field if present
    if (typeof obj['result'] === 'string') {
      return truncatePreview(obj['result']);
    }
    return 'Done';
  }

  return 'Done';
}
