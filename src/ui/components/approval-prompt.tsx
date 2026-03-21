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
  // Generic fallback: toolName(key=value, ...)
  const pairs = Object.entries(obj ?? {})
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');
  return `${toolName}(${pairs})`;
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

  return (
    <Box flexDirection="column" marginY={1} marginLeft={2}>
      <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
        <Text color="yellow" bold>
          Approve command?
        </Text>
        <Box marginTop={1}>
          <Text dimColor>$ </Text>
          <Text>{command}</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press </Text>
        <Text color="green" bold>Y</Text>
        <Text dimColor> to approve, </Text>
        <Text color="red" bold>N</Text>
        <Text dimColor> to deny</Text>
      </Box>
    </Box>
  );
}
