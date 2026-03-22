import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useApproval } from '../hooks/use-approval.js';
import type { PendingApproval } from '../../core/types.js';

function formatApprovalCommand(toolName: string, args: unknown): string {
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

function getApprovalTitle(toolName: string, mcpServer?: string): string {
  if (mcpServer) return 'Approve external tool call?';
  if (toolName === 'bash') return 'Run shell command?';
  if (toolName === 'git') return 'Run git operation?';
  return 'Approve tool call?';
}

function getApprovalWarning(toolName: string, mcpServer?: string): string {
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

interface ApprovalPromptProps {
  approval: PendingApproval;
}

export function ApprovalPrompt({ approval }: ApprovalPromptProps) {
  const { approve, deny } = useApproval();

  useInput((input, key) => {
    if (input === 'y' || key.return) {
      approve();
    } else if (input === 'n' || key.escape) {
      deny();
    }
  });

  const command = formatApprovalCommand(approval.toolName, approval.args);
  const title = getApprovalTitle(approval.toolName, approval.mcpServer);
  const warning = getApprovalWarning(approval.toolName, approval.mcpServer);

  return (
    <Box flexDirection="column" marginY={1} marginLeft={2}>
      <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
        <Text color="yellow" bold>
          {title}
        </Text>
        <Box marginTop={1}>
          <Text color="yellow">Tool: </Text>
          <Text>{approval.toolName}</Text>
        </Box>
        {approval.mcpServer && (
          <Box>
            <Text color="yellow">Server: </Text>
            <Text>{approval.mcpServer}</Text>
            <Text dimColor> (external MCP)</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>{warning}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>$ </Text>
          <Text>{command}</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press </Text>
        <Text color="green" bold>
          Y
        </Text>
        <Text dimColor> to approve, </Text>
        <Text color="red" bold>
          N
        </Text>
        <Text dimColor> to deny</Text>
      </Box>
    </Box>
  );
}
