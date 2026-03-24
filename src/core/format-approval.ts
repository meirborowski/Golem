const COMMAND_FORMATTERS: Record<string, (args: Record<string, unknown>) => string | undefined> = {
  bash: (args) => (typeof args.command === 'string' ? args.command : undefined),
  git: (args) =>
    typeof args.subcommand === 'string'
      ? `git ${args.subcommand}${typeof args.args === 'string' ? ` ${args.args}` : ''}`
      : undefined,
};

const TITLES: Record<string, string> = {
  bash: 'Run shell command?',
  git: 'Run git operation?',
};

const WARNINGS: Record<string, string> = {
  bash: 'This command will run in your working directory and may modify files or execute arbitrary code.',
  git: 'This git action may modify repository state, history, or files.',
};

export function formatApprovalCommand(toolName: string, args: unknown): string {
  const obj = args as Record<string, unknown>;
  const formatter = COMMAND_FORMATTERS[toolName];
  if (formatter) {
    const result = formatter(obj);
    if (result) return result;
  }
  const pairs = Object.entries(obj ?? {})
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');
  return `${toolName}(${pairs})`;
}

export function getApprovalTitle(toolName: string, mcpServer?: string): string {
  if (mcpServer) return 'Approve external tool call?';
  return TITLES[toolName] ?? 'Approve tool call?';
}

export function getApprovalWarning(toolName: string, mcpServer?: string): string {
  if (mcpServer) {
    return `This tool executes on the "${mcpServer}" MCP server.`;
  }
  return WARNINGS[toolName] ?? 'This tool call may affect your workspace.';
}
