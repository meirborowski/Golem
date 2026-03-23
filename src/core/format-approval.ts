export function formatApprovalCommand(toolName: string, args: unknown): string {
  const obj = args as Record<string, unknown>;
  if (toolName === 'bash' && typeof obj?.command === 'string') {
    return obj.command;
  }
  if (toolName === 'git' && typeof obj?.subcommand === 'string') {
    const gitArgs = typeof obj.args === 'string' ? ` ${obj.args}` : '';
    return `git ${obj.subcommand}${gitArgs}`;
  }
  const pairs = Object.entries(obj ?? {})
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');
  return `${toolName}(${pairs})`;
}

export function getApprovalTitle(toolName: string, mcpServer?: string): string {
  if (mcpServer) return 'Approve external tool call?';
  if (toolName === 'bash') return 'Run shell command?';
  if (toolName === 'git') return 'Run git operation?';
  return 'Approve tool call?';
}

export function getApprovalWarning(toolName: string, mcpServer?: string): string {
  if (mcpServer) {
    return `This tool executes on the "${mcpServer}" MCP server.`;
  }
  if (toolName === 'bash') {
    return 'This command will run in your working directory and may modify files or execute arbitrary code.';
  }
  if (toolName === 'git') {
    return 'This git action may modify repository state, history, or files.';
  }
  return 'This tool call may affect your workspace.';
}
