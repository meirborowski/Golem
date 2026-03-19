import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useApproval } from '../hooks/use-approval.js';
import type { PendingApproval } from '../../core/types.js';

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

  const command = (approval.args as { command?: string })?.command ?? JSON.stringify(approval.args);

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
