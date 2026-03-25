import React from 'react';
import { Box, Text, useInput } from 'ink';
import { formatApprovalCommand, getApprovalTitle, getApprovalWarning } from '../../core/format-approval.js';
import type { PendingApprovalInfo } from '../../subscribers/approval-gate.js';

interface ApprovalPromptProps {
  approval: PendingApprovalInfo;
  onApprove: () => void;
  onDeny: () => void;
}

export function ApprovalPrompt({ approval, onApprove, onDeny }: ApprovalPromptProps) {
  useInput((input, key) => {
    if (input === 'y' || key.return) {
      onApprove();
    } else if (input === 'n' || key.escape) {
      onDeny();
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
